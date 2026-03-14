# Ghost Business Verifier

A comprehensive B2B fintech platform that automates "proof of existence" verification for businesses. It detects ghost companies registered at fake or residential addresses through a multi-step Know Your Business (KYB) onboarding flow backed by AWS Rekognition and SageMaker.

## Problem Statement

Most B2B fintech platforms lack automated verification of whether a business physically exists. This leaves them vulnerable to ghost businesses registered at fake or residential addresses. Ghost Business Verifier solves this by combining document capture, physical location evidence, liveness challenges, and AI-powered deepfake detection into a single guided mobile verification flow.

## Architecture

This is a monorepo containing three components as Git submodules:

```
HACKnocturne/
├── HACKnocturne/        # React Native / Expo mobile app
├── ghost-verifier01/    # Backend verification server
├── Dashboard/           # Service monitoring dashboard
└── README.md
```

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native, Expo, React Navigation (Stack) |
| Camera / Media | Expo Camera, Expo ImageManipulator |
| Location | expo-location (high-accuracy GPS + reverse geocoding) |
| Sensors | Accelerometer (liveness signal) |
| Storage | AsyncStorage (local verification history) |
| AI / ML | AWS Rekognition (label detection), AWS SageMaker (deepfake detection) |
| Backend | Node.js server with WebSocket + REST fallback polling |
| Dashboard | Web-based service monitoring interface |

## Verification Flow

The app guides the user through a comprehensive 10-step KYB verification pipeline:

```
Home → Document → Signboard → Exterior → Interior → LivenessChallenge
  → BusinessDetails → MapLocation → VerificationSummary → Capture (video) → Result
```

Each step collects a different category of evidence before the final AI-powered verification.

---

## HACKnocturne (Mobile App)

The React Native / Expo mobile app that provides the full verification experience. Uses a dark theme with `#0A0F1E` background and `#2563EB` accent blue.

### `App.js`

Main application entry point. Registers all screens in a React Navigation stack navigator and defines the navigation structure for the full verification pipeline.

### Screens

#### `screens/HomeScreen.js`

Entry point of the verification flow. Collects initial business information:
- Business type dropdown (Pvt Ltd, LLP, OPC, DPIIT Startup, etc.)
- Registration ID type selector with dynamic placeholder (GST / CIN / UDYAM / PAN)
- Owner name input
- 10-digit phone number input with `+91` prefix and strict validation
- Progress indicator showing current position in the verification pipeline
- Navigation link to HistoryScreen for past verifications

#### `screens/DocumentScreen.js`

Step 2 of onboarding. Camera-based document capture with a corner-marker frame overlay:
- GST Certificate
- Owner Photo ID
- Utility Bill (address proof)
- Shop/Trade License
- Business Registration Certificate

Each document supports per-document retake flow. Progress bar reflects the current position in the verification pipeline.

#### `screens/SignboardCaptureScreen.js`

Captures the business signboard/name board in landscape orientation:
- Amber corner guides for framing
- Resizes captured image to 1600px via `ImageManipulator` for OCR readability
- Enhance button applies a second processing pass for unclear signboards

#### `screens/ExteriorCaptureScreen.js`

Captures 3 required exterior evidence photos:
1. Building entrance
2. Street view
3. Shop front

Camera overlay shows contextual hints for each slot. All 3 must be captured before proceeding.

#### `screens/InteriorCaptureScreen.js`

Captures interior evidence with 4 slots (minimum 2 required):
1. Desks / workstations
2. Shelves / storage
3. Products / inventory
4. Equipment / machinery

Camera watermarks "AI fraud detection active" to indicate that AI is actively scanning for residential objects that may suggest a non-commercial location.

#### `screens/LivenessChallengeScreen.js`

Anti-replay liveness verification. Randomly selects 4 challenges from a pool of 10:
- Directional camera movements (pan left, tilt up, etc.)
- "Zoom into signboard"
- "Show entrance from different angle"
- Other physical-presence challenges

Each challenge has a 5-second countdown. The CameraView stays live throughout. This prevents pre-recorded video submissions.

#### `screens/BusinessDetailsScreen.js`

Collects supplementary business metadata:
- Phone number (10-digit validation)
- Email (regex-validated)
- Business category (14 options)
- Working days selection via bottom-sheet modal dropdown
- Working hours selection via bottom-sheet modal dropdown

#### `screens/MapLocationScreen.js`

GPS-based location verification:
- High-accuracy GPS fix via `expo-location`
- Reverse geocoding to display human-readable address
- Custom grid map visual with pin marker
- Platform-aware "Open in Maps" deep link (Google Maps / Apple Maps)
- Two-step confirmation before proceeding to prevent accidental submission

#### `screens/VerificationSummaryScreen.js`

Full evidence review screen before final submission:
- Document thumbnails
- Signboard preview
- Exterior photo grid
- Interior photo grid
- Liveness challenge completion badge
- Business details with human-readable label mappings (category, days, hours)
- GPS location card with coordinates and address

Final submit button routes to the video capture screen.

#### `screens/CaptureScreen.js`

Guided video recording with AI-assisted verification signals:
- **Pre-flight checks**: Camera access, GPS location, and network reachability verification before recording begins
- **4-phase guided recording** with animated progress bar per phase:
  1. Building entrance and signboard (8 seconds)
  2. Walk inside the premises (8 seconds)
  3. Office interior pan (8 seconds)
  4. ID card held to camera (6 seconds)
- **Random liveness challenges**: 3 challenges selected from a pool of 9, fired at t=3s, t=13s, t=23s during recording with 5-second countdowns
- Accelerometer data collected throughout for liveness signal analysis
- GPS accuracy displayed on overlay (in meters)
- Compact recording indicator badge showing elapsed time

#### `screens/ResultScreen.js`

Displays AI verification results after backend processing:
- **Deepfake / liveness section**: Risk percentage with LOW / MEDIUM / HIGH badge (SageMaker output)
- **Risk factor analysis** flags:
  - No signage detected
  - Residential objects present
  - GPS mismatch with registered address
  - Low infrastructure score
  - Incomplete recording
- **Recommended actions** based on PASSED / REVIEW / FAILED status
- **Share report** via React Native Share API with a plain-text formatted report (score breakdown, detected labels, GPS coordinates, risk flags)
- Automatically saves result to HistoryScreen on completion via both WebSocket and fallback-poll paths

#### `screens/HistoryScreen.js`

Verification history persisted locally:
- Stores up to 50 completed verifications in AsyncStorage
- Each entry shows: verification score, status (PASSED/REVIEW/FAILED), business name, and timestamp
- Supports clear-all to reset history

#### `screens/StrictCaptureCamera.jsx`

Reusable camera component used across capture screens. Provides a consistent camera interface with overlay support.

### Expo Router Screens

#### `app/(tabs)/index.tsx`

Expo Router tabs index screen. Serves as the tab-based navigation entry point for the app.

#### `app/AuditScreen.tsx`

Audit log screen accessible via the tab navigator. Displays verification audit trail information.

### Components

#### `components/hello-wave.tsx`

Animated wave component used in the app UI.

---

## ghost-verifier01 (Backend Server)

The backend verification server that processes submitted evidence and returns verification scores.

- Receives uploaded video, photos, documents, GPS data, and accelerometer readings from the mobile app
- Integrates with **AWS Rekognition** for object and label detection in images and video frames (identifies signage, office equipment, residential objects, etc.)
- Integrates with **AWS SageMaker** for deepfake detection and liveness analysis
- Computes a composite verification score based on all evidence
- Communicates results back to the mobile app via WebSocket with REST polling as a fallback
- Classifies businesses as PASSED, REVIEW, or FAILED based on configurable thresholds

---

## Dashboard

Web-based monitoring dashboard for the verification service:

- View and manage submitted business verifications
- Monitor verification pipeline status
- Review flagged or failed verifications
- Access aggregated analytics and verification trends

---

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator / Android Emulator or physical device with Expo Go
- AWS account with Rekognition and SageMaker configured (for backend)

### Clone with Submodules

```bash
git clone --recurse-submodules https://github.com/PRERAN001/HACKnocturne.git
cd HACKnocturne
```

If you already cloned without submodules:

```bash
git submodule update --init --recursive
```

### Mobile App Setup

```bash
cd HACKnocturne
npm install
npx expo start
```

Scan the QR code with Expo Go on your device, or press `i` for iOS simulator / `a` for Android emulator.

### Backend Server Setup

```bash
cd ghost-verifier01
npm install
# Configure AWS credentials and environment variables
npm start
```

### Dashboard Setup

```bash
cd Dashboard
npm install
npm start
```

---

## Dependencies

Key mobile app dependencies:

| Package | Purpose |
|---|---|
| `expo` | React Native framework and build tooling |
| `@react-navigation/stack` | Stack-based screen navigation |
| `@react-native-async-storage/async-storage` | Local verification history persistence |
| `expo-camera` | Camera access for document and video capture |
| `expo-location` | GPS location and reverse geocoding |
| `expo-image-manipulator` | Image resizing and enhancement for OCR |
| `expo-sensors` | Accelerometer data for liveness detection |

## License

This project was built for the HACKnocturne hackathon.
