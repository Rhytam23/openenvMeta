import sys

try:
    from tasks.task_easy import TaskEasy
    from tasks.task_medium import TaskMedium
    from tasks.task_hard import TaskHard

    t1 = TaskEasy()
    t1.reset()
    assert 0.0 <= t1.env.grade() <= 1.0

    t2 = TaskMedium()
    t2.reset()
    assert 0.0 <= t2.env.grade() <= 1.0

    t3 = TaskHard()
    t3.reset()
    assert 0.0 <= t3.env.grade() <= 1.0

    print("Task suites passed!")

except Exception as e:
    print(f"Error testing tasks: {e}")
    sys.exit(1)
