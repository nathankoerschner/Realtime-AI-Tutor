#!/usr/bin/env python3
"""Command-line interface for AI tutor evaluation."""

import asyncio
import argparse
import json
import sys
from pathlib import Path
from typing import List, Optional

from evals.runners.scenario_runner import ScenarioRunner
from evals.scenarios.basic_scenarios import ALL_SCENARIOS
from evals.analyzers.performance_analyzer import PerformanceAnalyzer, PerformanceBenchmark
from backend.app.config import EVAL_LOG_DIR


class EvalCLI:
    """Command-line interface for running evaluations."""
    
    def __init__(self):
        self.scenario_runner = ScenarioRunner()
        self.performance_analyzer = PerformanceAnalyzer()
    
    async def run_scenarios(self, scenario_names: Optional[List[str]] = None, 
                          tags: Optional[List[str]] = None,
                          output_file: Optional[str] = None) -> None:
        """Run specified scenarios or all scenarios."""
        
        if scenario_names:
            scenarios = [s for s in ALL_SCENARIOS if s.name in scenario_names]
            if len(scenarios) != len(scenario_names):
                found_names = [s.name for s in scenarios]
                missing = set(scenario_names) - set(found_names)
                print(f"Warning: Could not find scenarios: {missing}")
            
            print(f"Running {len(scenarios)} specified scenarios...")
            
            results = {"scenarios": []}
            for scenario in scenarios:
                print(f"  Running {scenario.name}...")
                result = await self.scenario_runner.run_scenario(scenario)
                results["scenarios"].append(result)
                print(f"    {'✓ PASS' if result['success'] else '✗ FAIL'}")
        else:
            print("Running all scenarios...")
            results = await self.scenario_runner.run_all_scenarios(filter_tags=tags)
        
        # Print summary
        self._print_results_summary(results)
        
        # Save results if requested
        if output_file:
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(output_path, 'w') as f:
                json.dump(results, f, indent=2)
            print(f"\nResults saved to: {output_path}")
    
    def analyze_performance(self, run_id: Optional[str] = None, 
                          hours: int = 24) -> None:
        """Analyze performance metrics."""
        
        if run_id:
            print(f"Analyzing performance for run: {run_id}")
            metrics = self.performance_analyzer.analyze_run(run_id)
            self._print_performance_metrics(metrics, run_id)
        else:
            print(f"Analyzing performance for last {hours} hours...")
            recent_runs = self.performance_analyzer.analyze_recent_runs(hours)
            
            if not recent_runs:
                print("No evaluation runs found in the specified time period.")
                return
            
            print(f"\nFound {len(recent_runs)} evaluation runs:")
            for run_id, metrics in recent_runs.items():
                print(f"\n--- {run_id} ---")
                self._print_performance_metrics(metrics, run_id)
    
    def list_scenarios(self) -> None:
        """List all available scenarios."""
        print("Available scenarios:")
        print()
        
        for scenario in ALL_SCENARIOS:
            tags_str = f" (tags: {', '.join(scenario.tags)})" if scenario.tags else ""
            print(f"  {scenario.name}{tags_str}")
            print(f"    {scenario.description}")
            print(f"    Topic: {scenario.initial_topic} | Level: {scenario.student_level}")
            print(f"    Turns: {len(scenario.turns)}")
            print()
    
    def _print_results_summary(self, results: dict) -> None:
        """Print formatted results summary."""
        
        if "summary" in results:
            # Batch results
            summary = results["summary"]
            print(f"\n📊 EVALUATION SUMMARY")
            print(f"   Scenarios: {summary['successful_scenarios']}/{summary['total_scenarios']} passed")
            print(f"   Success Rate: {summary['success_rate']:.1%}")
            print(f"   Total Turns: {summary['total_turns']}")
            
            if summary.get("avg_socratic_scores"):
                socratic = summary["avg_socratic_scores"]
                print(f"\n🎭 SOCRATIC METHOD SCORES")
                print(f"   Overall: {socratic['overall']:.2f}/1.0")
                print(f"   Question Quality: {socratic['question_quality']:.2f}/1.0")
                print(f"   Guidance Effectiveness: {socratic['guidance_effectiveness']:.2f}/1.0")
                print(f"   Answer Giving (lower better): {socratic['answer_giving']:.2f}/1.0")
            
            if summary.get("avg_ttff_ms"):
                print(f"\n⚡ PERFORMANCE")
                print(f"   Avg Time to First Frame: {summary['avg_ttff_ms']:.0f}ms")
                print(f"   Avg Response Latency: {summary.get('avg_response_latency_ms', 0):.0f}ms")
        
        else:
            # Individual scenario results
            scenarios = results.get("scenarios", [])
            passed = sum(1 for s in scenarios if s["success"])
            print(f"\n📊 RESULTS: {passed}/{len(scenarios)} scenarios passed")
            
            for scenario_result in scenarios:
                name = scenario_result["scenario"]
                success = "✓ PASS" if scenario_result["success"] else "✗ FAIL"
                turns = len(scenario_result["turns"])
                errors = len(scenario_result["errors"])
                
                print(f"   {success} {name} ({turns} turns, {errors} errors)")
    
    def _print_performance_metrics(self, metrics, run_id: str) -> None:
        """Print formatted performance metrics."""
        grades = PerformanceBenchmark.grade_metrics(metrics)
        
        print(f"📈 Performance Metrics:")
        
        if metrics.time_to_first_frame_ms:
            grade = grades.get('ttff', '?')
            print(f"   Time to First Frame: {metrics.time_to_first_frame_ms:.0f}ms ({grade})")
        
        if metrics.avg_response_latency_ms:
            grade = grades.get('latency', '?')
            print(f"   Avg Response Latency: {metrics.avg_response_latency_ms:.0f}ms ({grade})")
            
        if metrics.p95_response_latency_ms:
            print(f"   P95 Response Latency: {metrics.p95_response_latency_ms:.0f}ms")
        
        if metrics.audio_latency_ms:
            print(f"   Audio Roundtrip: {metrics.audio_latency_ms:.0f}ms")
        
        grade = grades.get('connection', '?')
        print(f"   Connection Success: {metrics.connection_success_rate:.1%} ({grade})")
        
        grade = grades.get('ui', '?')
        print(f"   UI Responsiveness: {metrics.ui_responsiveness_score:.1%} ({grade})")
        
        if metrics.error_count > 0:
            print(f"   Errors: {metrics.error_count}")


async def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(description="AI Tutor Evaluation CLI")
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Run scenarios command
    run_parser = subparsers.add_parser('run', help='Run evaluation scenarios')
    run_parser.add_argument('--scenarios', nargs='+', help='Specific scenarios to run')
    run_parser.add_argument('--tags', nargs='+', help='Filter scenarios by tags')
    run_parser.add_argument('--output', help='Output file for results (JSON)')
    
    # Analyze performance command
    perf_parser = subparsers.add_parser('analyze', help='Analyze performance metrics')
    perf_parser.add_argument('--run-id', help='Specific run ID to analyze')
    perf_parser.add_argument('--hours', type=int, default=24, help='Hours of history to analyze')
    
    # List scenarios command
    list_parser = subparsers.add_parser('list', help='List available scenarios')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    cli = EvalCLI()
    
    try:
        if args.command == 'run':
            await cli.run_scenarios(
                scenario_names=args.scenarios,
                tags=args.tags,
                output_file=args.output
            )
        elif args.command == 'analyze':
            cli.analyze_performance(
                run_id=args.run_id,
                hours=args.hours
            )
        elif args.command == 'list':
            cli.list_scenarios()
    
    except KeyboardInterrupt:
        print("\n❌ Evaluation interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())