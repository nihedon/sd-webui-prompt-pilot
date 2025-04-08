import launch

if not launch.is_installed("polars"):
    launch.run_pip("install polars", "polars")
