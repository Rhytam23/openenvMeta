import sys
import os
import json
from env.core import SmartParkingEnv
from env.models import Action, ActionType, Direction

def audit():
    print("--- Auditing SmartParkingEnv ---")
    env = SmartParkingEnv()
    
    # 1. Test Reset
    print("Testing reset()...")
    obs = env.reset(seed=42)
    print(f"Observation: {obs}")
    assert isinstance(obs.agent_position, tuple), "agent_position must be a tuple"
    
    # 2. Test Step
    print("Testing step()...")
    action = {"type": "move", "direction": "up"}
    obs, reward, done, info = env.step(action)
    print(f"Reward: {reward}, Done: {done}, Info: {info}")
    assert isinstance(reward, float), "reward must be a float"
    assert isinstance(done, bool), "done must be a boolean"
    
    # 3. Test State
    print("Testing state()...")
    state = env.state()
    print(f"State keys: {state.keys()}")
    assert "agent_position" in state, "state must contain agent_position"
    assert "parking_spots" in state, "state must contain parking_spots"
    
    print("--- Environment Signature Audit Passed ---")

if __name__ == "__main__":
    try:
        audit()
    except Exception as e:
        print(f"Audit Failed: {e}")
        sys.exit(1)
