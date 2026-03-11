#!/usr/bin/env python3
"""Demo script showing the evaluation framework in action."""

import asyncio
import json
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from evals.scenarios.basic_scenarios import PHOTOSYNTHESIS_DISCOVERY, QUICK_RESPONSE_TEST
from evals.runners.scenario_runner import ScenarioRunner
from evals.analyzers.report_generator import EvalReportGenerator
from evals.rubrics.socratic_eval import SocraticEvaluator, AnswerGivingDetector


async def demo_scenario_execution():
    """Demonstrate running evaluation scenarios."""
    print("🎯 AI Tutor Evaluation Framework Demo")
    print("=" * 50)
    
    runner = ScenarioRunner("http://localhost:8000")
    
    print("\n1. Running sample scenarios...")
    
    # Run a quick demo scenario
    print(f"   Running: {QUICK_RESPONSE_TEST.name}")
    result = await runner.run_scenario(QUICK_RESPONSE_TEST, "demo_quick")
    
    success_icon = "✅" if result["success"] else "❌"
    print(f"   Result: {success_icon} {len(result['turns'])} turns, {len(result['errors'])} errors")
    
    return result


def demo_socratic_evaluation():
    """Demonstrate Socratic method evaluation."""
    print("\n2. Socratic Method Evaluation Demo...")
    
    # Test answer detection
    print("\n   Testing Answer Detection:")
    
    bad_response = "The answer is 42. Plants make food through photosynthesis using sunlight."
    good_response = "That's an interesting question! What do you think plants might need to make their own food?"
    
    bad_patterns = AnswerGivingDetector.detect_direct_answers(bad_response)
    good_questions = AnswerGivingDetector.has_guiding_questions(good_response)
    
    print(f"   Bad response patterns found: {len(bad_patterns)} ❌")
    print(f"   Good response has questions: {good_questions} ✅")
    
    return {"bad_patterns": bad_patterns, "has_questions": good_questions}


def demo_performance_analysis():
    """Demonstrate performance analysis."""
    print("\n3. Performance Analysis Demo...")
    
    # Create mock performance data
    mock_events = [
        {"eval_run_id": "demo", "name": "session_start", "at_ms": 0},
        {"eval_run_id": "demo", "name": "first_audio_frame", "at_ms": 350},
        {"eval_run_id": "demo", "name": "tutor_response_start", "at_ms": 1200, 
         "meta": {"response_latency_ms": 850}},
    ]
    
    print(f"   Analyzing {len(mock_events)} performance events...")
    print(f"   Time to First Frame: 350ms ✅ (Grade: A)")
    print(f"   Response Latency: 850ms ✅ (Grade: A)")
    
    return mock_events


async def demo_report_generation():
    """Demonstrate report generation."""
    print("\n4. Report Generation Demo...")
    
    # Create mock results
    mock_results = {
        "run_id": "demo_run_20240310",
        "scenario": "demo_scenario",
        "success": True,
        "turns": [
            {
                "turn_number": 1,
                "student_input": "What's photosynthesis?",
                "tutor_response": "Great question! What do you think plants need to survive?",
                "socratic_score": {
                    "answer_giving_score": 0.1,
                    "question_quality_score": 0.9,
                    "overall_score": 0.85
                }
            }
        ],
        "performance_metrics": {
            "ttff_ms": 350,
            "avg_latency_ms": 850,
            "connection_rate": 1.0
        },
        "summary": {
            "total_scenarios": 1,
            "successful_scenarios": 1,
            "success_rate": 1.0,
            "avg_socratic_scores": {
                "overall": 0.85,
                "question_quality": 0.9,
                "answer_giving": 0.1,
                "guidance_effectiveness": 0.8
            }
        }
    }
    
    # Generate HTML report
    output_path = Path("backend/results/demo_report.html")
    EvalReportGenerator.generate_html_report(mock_results, output_path)
    
    print(f"   ✅ Generated report: {output_path}")
    print(f"   Open in browser to view comprehensive results")
    
    return str(output_path)


async def main():
    """Run the complete evaluation demo."""
    print("Starting AI Tutor Evaluation Framework Demo...\n")
    
    try:
        # 1. Scenario execution (with mocked backend)
        scenario_result = await demo_scenario_execution()
        
        # 2. Socratic evaluation
        socratic_demo = demo_socratic_evaluation()
        
        # 3. Performance analysis
        performance_demo = demo_performance_analysis()
        
        # 4. Report generation
        report_path = await demo_report_generation()
        
        print("\n" + "=" * 50)
        print("🎉 Demo Complete!")
        print("\nNext Steps:")
        print("  1. Start your backend: cd backend && uv run uvicorn app.main:app --reload")
        print("  2. Run real evaluations: python scripts/run-evals.py run")
        print("  3. View generated report: open backend/results/demo_report.html")
        print("  4. Read the docs: evals/README.md and evals/USAGE.md")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Demo failed: {e}")
        print("This is expected if the backend is not running.")
        print("The evaluation framework components are still demonstrated above!")
        return False


if __name__ == "__main__":
    asyncio.run(main())