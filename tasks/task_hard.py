import random
from env.core import SmartParkingEnv

class TaskHard:
    """
    Task 3 (Hard): Multi-agent optimization (simulate 5 vehicles).
    - Avoid conflicts
    - Minimize total congestion
    """
    def __init__(self):
        self.seed = 4242
        self.num_agents = 5
        self.env = SmartParkingEnv(grid_size=10, num_spots=20, max_steps=100)
        self.agent_positions = []
        self.reservations = []
        self.parked = []
        self.conflicts = 0
        
    def reset(self):
        self.env.reset(seed=self.seed)
        # Initialize 5 different random positions using the seeded random
        self.agent_positions = []
        self.reservations = [None] * self.num_agents
        self.parked = [False] * self.num_agents
        self.conflicts = 0
        
        while len(self.agent_positions) < self.num_agents:
            pos = (random.randint(0, self.env.grid_size - 1), random.randint(0, self.env.grid_size - 1))
            if pos not in self.agent_positions:
                self.agent_positions.append(pos)
                
        return {
            "spots": self.env.parking_spots,
            "agents": self.agent_positions
        }

    def get_grader(self):
        """Returns deterministic grader function."""
        def grader(num_parked: int, total_steps: int, optimal_steps_baseline: int, conflicts: int = 0) -> float:
            score = 0.0
            
            # % vehicles parked successfully (max 0.4)
            parked_ratio = num_parked / self.num_agents
            score += 0.4 * parked_ratio
            
            # total steps efficiency (max 0.4)
            if total_steps > 0 and optimal_steps_baseline > 0:
                efficiency = min(1.0, optimal_steps_baseline / total_steps)
                score += 0.4 * efficiency
                
            # zero conflicts bonus (max 0.2)
            if conflicts == 0:
                score += 0.2
                
            return min(1.0, max(0.0, score))
            
        return grader
