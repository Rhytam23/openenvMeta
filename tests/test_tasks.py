import sys

try:
    from tasks.task_easy import TaskEasy
    from tasks.task_medium import TaskMedium
    from tasks.task_hard import TaskHard

    # Test Easy
    t1 = TaskEasy()
    t1.reset()
    grader1 = t1.get_grader()
    assert grader1(t1.optimal_dist + 1, True) == 1.0, "Easy Grader failed"
    print("TaskEasy passed!")

    # Test Medium
    t2 = TaskMedium()
    t2.reset()
    grader2 = t2.get_grader()
    assert grader2(True, True) == 1.0, "Medium Grader failed"
    print("TaskMedium passed!")

    # Test Hard
    t3 = TaskHard()
    t3.reset()
    grader3 = t3.get_grader()
    assert grader3(5, 10, 10, 0) == 1.0, "Hard Grader failed"
    print("TaskHard passed!")
    
except Exception as e:
    print(f"Error testing tasks: {e}")
    sys.exit(1)
