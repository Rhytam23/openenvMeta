from env.core import SmartParkingEnv

class TaskMedium:
    """
    Task 2 (Medium): Reserve a parking spot before reaching it.
    - Spots can be taken by others.
    """
    def __init__(self):
        self.seed = 100
        self.env = SmartParkingEnv(grid_size=10, num_spots=15, max_steps=50)
        
    def reset(self):
        obs = self.env.reset(seed=self.seed, random_start=True)
        return obs

    def get_grader(self):
        """Returns deterministic grader function."""
        def grader(successful_reservation: bool, reached_reserved_spot: bool) -> float:
            score = 0.0
            if successful_reservation:
                score += 0.5
            if reached_reserved_spot:
                score += 0.5
            return score
            
        return grader
