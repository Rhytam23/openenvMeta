import sys
from parking_env.core import SmartParkingEnv
from parking_env.reward_engine import RewardEngine

def test_reward_engine():
    try:
        # Create a blank engine
        engine = RewardEngine(max_ep_reward=20.0, min_ep_reward=-20.0)
        engine.reset((0, 0))
        
        # Test valid move closer
        r1 = engine.calculate_reward(current_pos=(0, 1), old_dist_to_spot=5.0, new_dist_to_spot=4.0, action_type="move", action_valid=True, reserved=False, time_elapsed=1, just_parked=False)
        # Closer (+1.0) - Time_penalty (-0.1) = 0.9
        assert abs(r1 - 0.9) < 0.001, f"Expected 0.9, got {r1}"
        assert engine.cum_reward == 0.9
        
        # Test valid move away
        r2 = engine.calculate_reward(current_pos=(1, 1), old_dist_to_spot=4.0, new_dist_to_spot=5.0, action_type="move", action_valid=True, reserved=False, time_elapsed=2, just_parked=False)
        # Away (-1.0) - Time_penalty (-0.1) = -1.1
        assert abs(r2 - (-1.1)) < 0.001, f"Expected -1.1, got {r2}"
        assert abs(engine.cum_reward - (-0.2)) < 0.001
        
        # Test circling penalty
        r3 = engine.calculate_reward(current_pos=(0, 1), old_dist_to_spot=5.0, new_dist_to_spot=4.0, action_type="move", action_valid=True, reserved=False, time_elapsed=3, just_parked=False)
        # Closer (+1.0) - circling (-0.5) - time (-0.1) = 0.4
        assert abs(r3 - 0.4) < 0.001, f"Expected 0.4, got {r3}"
        assert abs(engine.cum_reward - 0.2) < 0.001
        
        # Test max clamping
        # Add 20.0 to engine, should clip
        r_clip = engine.calculate_reward(current_pos=(0, 1), old_dist_to_spot=4.0, new_dist_to_spot=4.0, action_type="move", action_valid=False, reserved=False, time_elapsed=4, just_parked=True)
        # Invalid action penalty (-5) + Parked bonus (10) - time (0.1) = 4.9. cum = 5.1.
        # Wait, if action is invalid, just_parked wouldn't trigger in reality but let's test pure clamping by overflowing.
        engine.cum_reward = 19.5
        r_clip2 = engine.calculate_reward(current_pos=(0, 1), old_dist_to_spot=4.0, new_dist_to_spot=3.0, action_type="move", action_valid=True, reserved=False, time_elapsed=5, just_parked=True)
        # Closer (1.0) + Parked (10.0) - Time (0.1) = +10.9
        # 19.5 + 10.9 = 30.4 > 20.0
        # Expected step reward returned = 20.0 - 19.5 = 0.5
        assert r_clip2 == 0.5, f"Expected 0.5, got {r_clip2}"
        assert engine.cum_reward == 20.0
        
        print("RewardEngine unit tests passed.")
        
        # Test Env integration
        env = SmartParkingEnv(grid_size=10, num_spots=10)
        env.reset(seed=42)
        initial_cum = env.reward_engine.cum_reward
        
        obs, reward, done, info = env.step({"type": "reserve_spot"})
        # Should be an early optimal reservation bonus if successful
        if info.get("reason", "") != "max_steps_exceeded":
             # just check it bounds
             assert -20.0 <= env.reward_engine.cum_reward <= 20.0
        print("Env integration reward bounding passed.")

    except AssertionError as e:
        print(f"Assertion failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_reward_engine()
