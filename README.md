---
title: Smart Parking Simulation
emoji: 🚗
colorFrom: blue
colorTo: indigo
sdk: docker
python_version: "3.10"
app_file: app.py
app_port: 7860
pinned: false
---

# Smart Parking Simulation (OpenEnv)

A production-grade, OpenEnv-compliant simulation environment for urban parking discovery and reservation. This project aims to model real-world congestion challenges and evaluate intelligent agents on their ability to efficiently navigate and secure parking in a dynamic city grid.

## 1. Overview
The **Smart Parking Simulation** models a 10x10 city grid where agents must navigate roads, identify available parking spots, and handle reservations to secure a space. It emphasizes trajectory-based efficiency and optimal decision-making under resource constraints.

## 2. Environment Design

### Observation Space (Pydantic-based)
- **agent_position**: `Tuple[int, int]` - Current grid coordinates.
- **nearby_parking**: `List[ParkingSpotInfo]` - Detected spots within range (5 units), including `distance` and `is_available`.
- **time_elapsed**: `int` - Number of steps since reset.
- **reservation_status**: `bool` - Whether the agent currently holds a reservation.

### Action Space
- **MOVE**: Move (up/down/left/right) on the grid.
- **SCAN**: Explicitly scan for parking updates (costs 1 step).
- **RESERVE**: Attempt to reserve the closest available spot.
- **CANCEL**: Release the current reservation.
- **WAIT**: Stay at the current position.

### Reward System
Implementing a **Dense Shaping Reward** engine:
- **Distance Shaping**: Positive reward for reducing Manhattan distance to a target spot; negative for moving away.
- **Success Bonus**: `+5` for successful parking.
- **Step Penalty**: `-1` per time step to encourage speed.
- **Operational Penalties**: `-5` for invalid actions, `-2` for circling behavior or redundant scans.
- **Bounds**: Episodic reward is strictly bounded between `-20.0` and `+20.0`.

## 3. Tasks

| Task | Level | Objective | Grading Criteria |
| :--- | :--- | :--- | :--- |
| **Task 1** | Easy | Find nearest available spot. | `optimal_steps / steps_taken` |
| **Task 2** | Medium| Reserve spot before reaching it. | 0.5 (Reservation) + 0.5 (Parking) |
| **Task 3** | Hard | Multi-agent (5 cars) coordination. | 0.4 (Ratio) + 0.4 (Efficiency) + 0.2 (Conflict-free) |

## 4. Setup

### Local Installation
```bash
# Clone the repository
git clone <repo-url>
cd smart-parking

# Install dependencies
pip install -e .
```

### Docker Usage
The project is containerized for HuggingFace Spaces.
```bash
# Build the image
docker build -t smart-parking:openenv .

# Run the container (exposed on port 7860)
docker run -p 7860:7860 smart-parking:openenv
```

## 5. Usage

### Run Simulation Server
```bash
python -m server.app
```

### Run Baseline Inference
Evaluates a hybrid heuristic + LLM agent across all three tasks.
```bash
export HF_TOKEN="your_token"
python inference/run_baseline.py
```

## 6. Validation
To verify OpenEnv compliance:
```bash
openenv validate .
```

## 7. Baseline Scores
Expected output format for `run_baseline.py`:
```text
Evaluating Task: Task 1 (Easy)...
Score: 0.82
Evaluating Task: Task 2 (Medium)...
Score: 1.00
Evaluating Task: Task 3 (Hard)...
Score: 0.45

==============================
FINAL SCORES
==============================
Easy:   0.82
Medium: 1.00
Hard:   0.45
------------------------------
AVERAGE SCORE: 0.76
==============================
```

---
**Tag**: `openenv`


