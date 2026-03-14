# AWS Configuration for the Audit System

This guide covers every AWS resource needed to run the Ghost Business Verifier
audit pipeline end-to-end. Follow each section in order.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Environment Variables](#environment-variables)
3. [S3 Bucket Setup](#s3-bucket-setup)
4. [IAM Policies](#iam-policies)
5. [Lambda Functions](#lambda-functions)
6. [S3 Event Notifications](#s3-event-notifications)
7. [Verification Checklist](#verification-checklist)

---

## Architecture Overview

```
Mobile App
  │
  ├─► POST /api/audit/:id/submit        (notifies backend)
  └─► PUT  presigned-url (S3)            (uploads audit thumbnail/video)
        │
        ▼
   ┌──────────┐  S3 Event Notification   ┌────────────────────┐
   │  S3      │ ──────────────────────►  │  Lambda Function   │
   │  Bucket  │                          │  (index.mjs)       │
   └──────────┘                          └────────┬───────────┘
                                                  │
                               Rekognition calls: │ DetectFaces
                                                  │ DetectText
                                                  │ DetectLabels
                                                  ▼
                                         POST /api/sessions/ai-result
                                              (backend)
```

For the **surprise audit** flow the same Lambda (or a dedicated audit variant)
is triggered by uploads to the `audit-thumbnails/` prefix and posts results to
`POST /api/audit/cv-result`.

---

## Environment Variables

Create a `.env` file in the `backend/` directory (see `.env.example`):

| Variable | Required By | Description |
|---|---|---|
| `AWS_REGION` | Backend + Lambda | AWS region (default `ap-south-1`) |
| `AWS_ACCESS_KEY_ID` | Backend | IAM access key for S3 presigned URLs |
| `AWS_SECRET_ACCESS_KEY` | Backend | IAM secret key for S3 presigned URLs |
| `S3_BUCKET_NAME` | Backend | Name of the S3 bucket |
| `BACKEND_URL` | Lambda | Public URL of the backend (`https://…`) |
| `MONGODB_URI` | Backend | MongoDB connection string |

> **Note:** The Lambda function does **not** need explicit credentials when it
> runs inside AWS — it uses the IAM execution role attached to the function.
> `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are only needed by the
> Express backend (e.g. when running on Railway, Render, or a VM).

---

## S3 Bucket Setup

### 1. Create the Bucket

```bash
aws s3api create-bucket \
  --bucket ghost-verifier-assets \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1
```

### 2. Required Prefixes

The application uses these key prefixes — no manual folder creation is needed
(S3 creates them on first write), but they are listed here for reference:

| Prefix | Purpose |
|---|---|
| `thumbnails/` | Original verification thumbnails |
| `videos/` | Original verification videos |
| `audit-thumbnails/` | Surprise-audit thumbnails |
| `audit-videos/` | Surprise-audit videos |

### 3. CORS Configuration

The mobile app uploads directly to S3 using presigned PUT URLs, so CORS must
allow PUT requests from any origin (or your app's specific origin):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Apply with:

```bash
aws s3api put-bucket-cors \
  --bucket ghost-verifier-assets \
  --cors-configuration file://cors.json
```

### 4. Block Public Access (Recommended)

All access goes through presigned URLs, so public access can stay blocked:

```bash
aws s3api put-public-access-block \
  --bucket ghost-verifier-assets \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

---

## IAM Policies

Two separate IAM principals are needed:

### 1. Backend IAM User (for presigned URL generation)

Create an IAM user (or use an existing one) and attach this policy.
The backend only needs `PutObject` (upload URLs) and `GetObject` (view URLs):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "GhostVerifierBackendS3",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::ghost-verifier-assets/*"
    }
  ]
}
```

Generate an access key for this user and set `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` in the backend `.env`.

### 2. Lambda Execution Role

Create an IAM role with the following trust policy (so Lambda can assume it):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

Attach these **permission policies** to the role:

#### a) S3 Read Access (to read uploaded images)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadS3Objects",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::ghost-verifier-assets/*"
    }
  ]
}
```

#### b) Amazon Rekognition Access

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RekognitionAccess",
      "Effect": "Allow",
      "Action": [
        "rekognition:DetectFaces",
        "rekognition:DetectText",
        "rekognition:DetectLabels"
      ],
      "Resource": "*"
    }
  ]
}
```

#### c) CloudWatch Logs (so Lambda can write logs)

Attach the AWS managed policy:

```
arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
```

**Example CLI — create the role and attach policies:**

```bash
# Create the role
aws iam create-role \
  --role-name GhostVerifierLambdaRole \
  --assume-role-policy-document file://lambda-trust-policy.json

# Attach managed CloudWatch Logs policy
aws iam attach-role-policy \
  --role-name GhostVerifierLambdaRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Create and attach S3 + Rekognition inline policy
aws iam put-role-policy \
  --role-name GhostVerifierLambdaRole \
  --policy-name GhostVerifierLambdaPermissions \
  --policy-document file://lambda-permissions-policy.json
```

---

## Lambda Functions

### 1. Deploy the Verification Lambda

This is the main Lambda at `backend/lambda/index.mjs`. It is triggered by S3
uploads to the `thumbnails/` prefix and performs Rekognition analysis on
verification thumbnails.

```bash
# Package the Lambda
cd backend/lambda
zip -r function.zip index.mjs

# Create the function
aws lambda create-function \
  --function-name GhostVerifierLambda \
  --runtime nodejs20.x \
  --role arn:aws:iam::<ACCOUNT_ID>:role/GhostVerifierLambdaRole \
  --handler index.handler \
  --zip-file fileb://function.zip \
  --timeout 30 \
  --memory-size 512 \
  --environment "Variables={AWS_REGION=ap-south-1,BACKEND_URL=https://your-backend.example.com}"
```

### 2. Deploy the Audit Lambda

The audit flow re-uses the same Rekognition pipeline. You can either:

- **Option A** — Point a second S3 trigger (on `audit-thumbnails/`) at the
  **same** `GhostVerifierLambda` function, and have the backend distinguish
  between initial and audit results based on the S3 key prefix.
- **Option B** — Create a **separate** Lambda function with audit-specific
  comparison logic (anchor frame vs. new frame SSIM/label overlap) that posts
  to `POST /api/audit/cv-result`.

For the simplest setup (**Option A**), no additional Lambda is needed — just
add a second S3 event notification (see the next section).

### Lambda Configuration Summary

| Setting | Value |
|---|---|
| Runtime | Node.js 20.x |
| Handler | `index.handler` |
| Timeout | 30 seconds |
| Memory | 512 MB |
| Environment: `AWS_REGION` | `ap-south-1` |
| Environment: `BACKEND_URL` | Public backend URL |

---

## S3 Event Notifications

S3 event notifications trigger the Lambda whenever a new image is uploaded.
Two notifications are needed — one for the initial verification and one for the
audit flow.

### 1. Grant S3 Permission to Invoke the Lambda

```bash
aws lambda add-permission \
  --function-name GhostVerifierLambda \
  --statement-id S3InvokeVerification \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::ghost-verifier-assets \
  --source-account <ACCOUNT_ID>
```

### 2. Configure the Notifications

Save the following as `s3-notification.json` (replace `<ACCOUNT_ID>` and
`<REGION>`):

```json
{
  "LambdaFunctionConfigurations": [
    {
      "Id": "VerificationThumbnailUpload",
      "LambdaFunctionArn": "arn:aws:lambda:<REGION>:<ACCOUNT_ID>:function:GhostVerifierLambda",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            { "Name": "prefix", "Value": "thumbnails/" },
            { "Name": "suffix", "Value": ".jpg" }
          ]
        }
      }
    },
    {
      "Id": "AuditThumbnailUpload",
      "LambdaFunctionArn": "arn:aws:lambda:<REGION>:<ACCOUNT_ID>:function:GhostVerifierLambda",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            { "Name": "prefix", "Value": "audit-thumbnails/" },
            { "Name": "suffix", "Value": ".jpg" }
          ]
        }
      }
    }
  ]
}
```

Apply:

```bash
aws s3api put-bucket-notification-configuration \
  --bucket ghost-verifier-assets \
  --notification-configuration file://s3-notification.json
```

---

## Verification Checklist

After completing the setup above, verify each component is working:

- [ ] **S3 bucket exists** and CORS is configured
  ```bash
  aws s3api head-bucket --bucket ghost-verifier-assets
  aws s3api get-bucket-cors --bucket ghost-verifier-assets
  ```

- [ ] **Backend can generate presigned URLs**
  ```bash
  curl "https://your-backend.example.com/api/upload/presigned-url?type=thumbnail&sessionId=test123"
  # Should return { "uploadUrl": "https://...", "s3Key": "thumbnails/test123_..." }
  ```

- [ ] **Lambda function is deployed** and has the correct environment variables
  ```bash
  aws lambda get-function-configuration --function-name GhostVerifierLambda
  # Verify Runtime=nodejs20.x, Environment contains BACKEND_URL and AWS_REGION
  ```

- [ ] **S3 event notifications are active**
  ```bash
  aws s3api get-bucket-notification-configuration --bucket ghost-verifier-assets
  # Should list both LambdaFunctionConfigurations (thumbnails/ and audit-thumbnails/)
  ```

- [ ] **Lambda execution role** has Rekognition, S3, and CloudWatch permissions
  ```bash
  aws iam list-attached-role-policies --role-name GhostVerifierLambdaRole
  aws iam get-role-policy --role-name GhostVerifierLambdaRole --policy-name GhostVerifierLambdaPermissions
  ```

- [ ] **End-to-end test**: Upload a `.jpg` to `thumbnails/` and check CloudWatch
  logs for Lambda execution, then verify the backend received the
  `POST /api/sessions/ai-result` call

- [ ] **Audit end-to-end test**: Trigger an audit (via dashboard or API), upload
  a `.jpg` to `audit-thumbnails/`, and verify the backend received the
  `POST /api/audit/cv-result` call
