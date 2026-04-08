from env.core import SmartParkingEnv

class TaskEasy:
    """
    Task 1 (Easy): Find nearest available parking.
    - Start random position
    - No reservation needed (agent usually reserves at the spot)
    """
    def __init__(self):
        self.seed = 42
        self.env = SmartParkingEnv(grid_size=10, num_spots=10, max_steps=50)
        self.optimal_dist = 0
        self.start_pos = (0, 0)
        
    def reset(self):
        obs = self.env.reset(seed=self.seed, random_start=True)
        self.start_pos = self.env.agent_pos
        self.optimal_dist = self.env._min_dist_to_available(self.start_pos)
        return obs

    def get_grader(self):
        """Returns deterministic grader function."""
        def grader(steps_taken: int, parked: bool) -> float:
            if not parked or self.optimal_dist == float('inf'):
                return 0.0
                
            # Optimal requires moving distance + 1 for reserving at the spot
            optimal_steps = self.optimal_dist + 1
            if optimal_steps == float('inf'):
                return 0.0
                
            score = optimal_steps / max(optimal_steps, steps_taken)
            return float(score)
            
        return grader
