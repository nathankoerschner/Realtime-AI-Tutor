"""AI Tutor Evaluation Framework.

This package provides comprehensive evaluation tools for the AI tutor project,
measuring performance, pedagogical effectiveness, and conversation quality.
"""

__version__ = "0.1.0"

from .scenarios.basic_scenarios import ALL_SCENARIOS
from .rubrics.socratic_eval import SocraticEvaluator, ConversationEvaluator
from .analyzers.performance_analyzer import PerformanceAnalyzer, PerformanceBenchmark  
from .runners.scenario_runner import ScenarioRunner

__all__ = [
    "ALL_SCENARIOS",
    "SocraticEvaluator", 
    "ConversationEvaluator",
    "PerformanceAnalyzer",
    "PerformanceBenchmark",
    "ScenarioRunner"
]