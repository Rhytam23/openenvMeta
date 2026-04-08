import json
from env.core import SmartParkingEnv
from env.models import ActionType, Direction

def test_simulation():
    env = SmartParkingEnv(grid_size=10, num_spots=5, max_steps=50)
    obs = env.reset()
    print(f"Initial Observation: {obs.dict()}")
    
    total_reward = 0
    done = False
    step_count = 0
    
    # 1. Scan for parking
    print("\n--- Step 1: Scan ---")
    action = {"type": "scan_parking"}
    obs, reward, done, info = env.step(action)
    total_reward += reward
    print(f"Reward: {reward}, Done: {done}, Info: {info}")
    
    if not obs.nearby_parking:
        print("No nearby parking found. Skipping move test.")
        return

    target_spot = obs.nearby_parking[0].position
    print(f"Target Spot: {target_spot}")

    # 2. Reserve the spot
    print("\n--- Step 2: Reserve ---")
    action = {"type": "reserve_spot"}
    obs, reward, done, info = env.step(action)
    total_reward += reward
    print(f"Reward: {reward}, Done: {done}, Reservation: {obs.reservation_status}, ResPos: {env.reservation}")

    # 3. Move toward the spot (Manual steps for demo)
    print("\n--- Step 3: Moving toward spot ---")
    while not done and step_count < 20:
        step_count += 1
        agent_pos = obs.agent_position
        
        # Simple heuristic move
        if agent_pos[0] < target_spot[0]:
            move_dir = "right"
        elif agent_pos[0] > target_spot[0]:
            move_dir = "left"
        elif agent_pos[1] < target_spot[1]:
            move_dir = "up"
        elif agent_pos[1] > target_spot[1]:
            move_dir = "down"
        else:
            # Already at spot but maybe not parked yet (should be done by now)
            break
            
        action = {"type": "move", "direction": move_dir}
        obs, reward, done, info = env.step(action)
        total_reward += reward
        print(f"Step {step_count}: Moved {move_dir} to {obs.agent_position}. Reward: {reward}")

    print(f"\nFinal Total Reward: {total_reward}")
    print(f"Is Parked: {env.is_parked}")
    print(f"Full State: {json.dumps(env.state(), indent=2)}")

if __name__ == "__main__":
    test_simulation()
