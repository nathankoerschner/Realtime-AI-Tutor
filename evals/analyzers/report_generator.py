"""Generate HTML reports for evaluation results."""

import json
from pathlib import Path
from typing import Dict, List
from datetime import datetime

from evals.analyzers.performance_analyzer import PerformanceBenchmark


class EvalReportGenerator:
    """Generates comprehensive HTML reports for evaluation runs."""
    
    @staticmethod
    def generate_html_report(results: Dict, output_path: Path) -> None:
        """Generate an HTML report from evaluation results."""
        
        html = f"""<!DOCTYPE html>
<html>
<head>
    <title>AI Tutor Evaluation Report</title>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; line-height: 1.6; }}
        .header {{ background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }}
        .metric {{ background: #fff; border: 1px solid #e9ecef; border-radius: 6px; padding: 15px; margin: 10px 0; }}
        .metric-title {{ font-weight: 600; margin-bottom: 8px; }}
        .score-good {{ color: #28a745; font-weight: bold; }}
        .score-warning {{ color: #ffc107; font-weight: bold; }}
        .score-bad {{ color: #dc3545; font-weight: bold; }}
        .grade {{ display: inline-block; padding: 4px 8px; border-radius: 4px; color: white; font-weight: bold; margin-left: 8px; }}
        .grade-A {{ background: #28a745; }}
        .grade-B {{ background: #17a2b8; }}
        .grade-C {{ background: #ffc107; }}
        .grade-F {{ background: #dc3545; }}
        .scenario-result {{ border-left: 4px solid #007bff; padding-left: 15px; margin: 15px 0; }}
        .scenario-pass {{ border-color: #28a745; }}
        .scenario-fail {{ border-color: #dc3545; }}
        .conversation-turn {{ background: #f8f9fa; margin: 5px 0; padding: 10px; border-radius: 4px; }}
        .student {{ color: #007bff; font-weight: 600; }}
        .tutor {{ color: #6f42c1; font-weight: 600; }}
        .summary-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }}
        table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
        th, td {{ border: 1px solid #dee2e6; padding: 8px 12px; text-align: left; }}
        th {{ background: #f8f9fa; font-weight: 600; }}
        .progress-bar {{ background: #e9ecef; height: 10px; border-radius: 5px; overflow: hidden; }}
        .progress-fill {{ height: 100%; transition: width 0.3s ease; }}
        .progress-good {{ background: #28a745; }}
        .progress-warning {{ background: #ffc107; }}
        .progress-bad {{ background: #dc3545; }}
        .code {{ background: #f8f9fa; border: 1px solid #e9ecef; padding: 10px; font-family: monospace; border-radius: 4px; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>🎓 AI Tutor Evaluation Report</h1>
        <p><strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        <p><strong>Run ID:</strong> {results.get('batch_run_id', results.get('run_id', 'N/A'))}</p>
    </div>
"""
        
        # Summary section
        if 'summary' in results:
            html += EvalReportGenerator._generate_summary_section(results['summary'])
        
        # Performance overview
        html += EvalReportGenerator._generate_performance_overview(results)
        
        # Socratic method analysis
        html += EvalReportGenerator._generate_socratic_analysis(results)
        
        # Individual scenario results
        scenarios = results.get('scenarios', [results] if 'turns' in results else [])
        html += EvalReportGenerator._generate_scenario_results(scenarios)
        
        html += """
</body>
</html>"""
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(html)
    
    @staticmethod
    def _generate_summary_section(summary: Dict) -> str:
        """Generate the summary section of the report."""
        success_rate = summary.get('success_rate', 0)
        success_class = 'score-good' if success_rate >= 0.8 else 'score-warning' if success_rate >= 0.6 else 'score-bad'
        
        return f"""
    <h2>📊 Evaluation Summary</h2>
    <div class="summary-grid">
        <div class="metric">
            <div class="metric-title">Overall Success Rate</div>
            <div class="{success_class}">{success_rate:.1%}</div>
            <div>({summary.get('successful_scenarios', 0)}/{summary.get('total_scenarios', 0)} scenarios passed)</div>
        </div>
        <div class="metric">
            <div class="metric-title">Total Conversation Turns</div>
            <div>{summary.get('total_turns', 0)}</div>
        </div>
        <div class="metric">
            <div class="metric-title">Total Errors</div>
            <div class="{'score-good' if summary.get('total_errors', 0) == 0 else 'score-bad'}">{summary.get('total_errors', 0)}</div>
        </div>
    </div>
"""
    
    @staticmethod
    def _generate_performance_overview(results: Dict) -> str:
        """Generate performance metrics overview."""
        
        # Aggregate performance data
        scenarios = results.get('scenarios', [results] if 'performance_metrics' in results else [])
        
        avg_ttff = None
        avg_latency = None
        
        if 'summary' in results:
            avg_ttff = results['summary'].get('avg_ttff_ms')
            avg_latency = results['summary'].get('avg_response_latency_ms')
        elif scenarios:
            ttff_values = [s.get('performance_metrics', {}).get('ttff_ms') for s in scenarios]
            latency_values = [s.get('performance_metrics', {}).get('avg_latency_ms') for s in scenarios]
            
            ttff_values = [v for v in ttff_values if v is not None]
            latency_values = [v for v in latency_values if v is not None]
            
            if ttff_values:
                avg_ttff = sum(ttff_values) / len(ttff_values)
            if latency_values:
                avg_latency = sum(latency_values) / len(latency_values)
        
        html = """
    <h2>⚡ Performance Metrics</h2>
    <div class="summary-grid">
"""
        
        if avg_ttff is not None:
            ttff_grade = 'A' if avg_ttff <= 300 else 'B' if avg_ttff <= 500 else 'C' if avg_ttff <= 1000 else 'F'
            html += f"""
        <div class="metric">
            <div class="metric-title">Time to First Frame</div>
            <div>{avg_ttff:.0f}ms <span class="grade grade-{ttff_grade}">{ttff_grade}</span></div>
            <div class="progress-bar">
                <div class="progress-fill progress-{'good' if ttff_grade in ['A', 'B'] else 'warning' if ttff_grade == 'C' else 'bad'}" style="width: {min(100, max(10, 100 - (avg_ttff / 1000) * 50)):.0f}%"></div>
            </div>
        </div>
"""
        
        if avg_latency is not None:
            latency_grade = 'A' if avg_latency <= 800 else 'B' if avg_latency <= 1500 else 'C' if avg_latency <= 3000 else 'F'
            html += f"""
        <div class="metric">
            <div class="metric-title">Response Latency</div>
            <div>{avg_latency:.0f}ms <span class="grade grade-{latency_grade}">{latency_grade}</span></div>
            <div class="progress-bar">
                <div class="progress-fill progress-{'good' if latency_grade in ['A', 'B'] else 'warning' if latency_grade == 'C' else 'bad'}" style="width: {min(100, max(10, 100 - (avg_latency / 3000) * 100)):.0f}%"></div>
            </div>
        </div>
"""
        
        html += """
    </div>
"""
        return html
    
    @staticmethod
    def _generate_socratic_analysis(results: Dict) -> str:
        """Generate Socratic method analysis section."""
        
        # Aggregate Socratic scores
        socratic_scores = results.get('summary', {}).get('avg_socratic_scores')
        
        if not socratic_scores:
            scenarios = results.get('scenarios', [results] if 'socratic_scores' in results else [])
            all_scores = []
            for scenario in scenarios:
                all_scores.extend(scenario.get('socratic_scores', []))
            
            if all_scores:
                socratic_scores = {
                    'overall': sum(s["overall_score"] for s in all_scores) / len(all_scores),
                    'answer_giving': sum(s["answer_giving_score"] for s in all_scores) / len(all_scores),
                    'question_quality': sum(s["question_quality_score"] for s in all_scores) / len(all_scores),
                    'guidance_effectiveness': sum(s["guidance_effectiveness_score"] for s in all_scores) / len(all_scores)
                }
        
        if not socratic_scores:
            return "<h2>🎭 Socratic Method Analysis</h2><p>No Socratic evaluation data available.</p>"
        
        return f"""
    <h2>🎭 Socratic Method Analysis</h2>
    <div class="summary-grid">
        <div class="metric">
            <div class="metric-title">Overall Score</div>
            <div class="{'score-good' if socratic_scores['overall'] >= 0.7 else 'score-warning' if socratic_scores['overall'] >= 0.5 else 'score-bad'}">{socratic_scores['overall']:.2f}/1.0</div>
            <div class="progress-bar">
                <div class="progress-fill progress-{'good' if socratic_scores['overall'] >= 0.7 else 'warning' if socratic_scores['overall'] >= 0.5 else 'bad'}" style="width: {socratic_scores['overall'] * 100:.0f}%"></div>
            </div>
        </div>
        <div class="metric">
            <div class="metric-title">Question Quality</div>
            <div class="{'score-good' if socratic_scores['question_quality'] >= 0.7 else 'score-warning' if socratic_scores['question_quality'] >= 0.5 else 'score-bad'}">{socratic_scores['question_quality']:.2f}/1.0</div>
            <div class="progress-bar">
                <div class="progress-fill progress-{'good' if socratic_scores['question_quality'] >= 0.7 else 'warning' if socratic_scores['question_quality'] >= 0.5 else 'bad'}" style="width: {socratic_scores['question_quality'] * 100:.0f}%"></div>
            </div>
        </div>
        <div class="metric">
            <div class="metric-title">Guidance Effectiveness</div>
            <div class="{'score-good' if socratic_scores['guidance_effectiveness'] >= 0.7 else 'score-warning' if socratic_scores['guidance_effectiveness'] >= 0.5 else 'score-bad'}">{socratic_scores['guidance_effectiveness']:.2f}/1.0</div>
            <div class="progress-bar">
                <div class="progress-fill progress-{'good' if socratic_scores['guidance_effectiveness'] >= 0.7 else 'warning' if socratic_scores['guidance_effectiveness'] >= 0.5 else 'bad'}" style="width: {socratic_scores['guidance_effectiveness'] * 100:.0f}%"></div>
            </div>
        </div>
        <div class="metric">
            <div class="metric-title">Answer Giving (lower is better)</div>
            <div class="{'score-good' if socratic_scores['answer_giving'] <= 0.3 else 'score-warning' if socratic_scores['answer_giving'] <= 0.5 else 'score-bad'}">{socratic_scores['answer_giving']:.2f}/1.0</div>
            <div class="progress-bar">
                <div class="progress-fill progress-{'bad' if socratic_scores['answer_giving'] >= 0.5 else 'warning' if socratic_scores['answer_giving'] >= 0.3 else 'good'}" style="width: {socratic_scores['answer_giving'] * 100:.0f}%"></div>
            </div>
        </div>
    </div>
"""
    
    @staticmethod 
    def _generate_scenario_results(scenarios: List[Dict]) -> str:
        """Generate detailed results for each scenario."""
        
        if not scenarios:
            return ""
        
        html = "<h2>📋 Scenario Results</h2>"
        
        for scenario in scenarios:
            scenario_name = scenario.get('scenario', 'Unknown')
            success = scenario.get('success', False)
            turns = scenario.get('turns', [])
            errors = scenario.get('errors', [])
            
            success_class = 'scenario-pass' if success else 'scenario-fail'
            success_icon = '✅' if success else '❌'
            
            html += f"""
    <div class="scenario-result {success_class}">
        <h3>{success_icon} {scenario_name.replace('_', ' ').title()}</h3>
"""
            
            if errors:
                html += f"""
        <div class="metric">
            <div class="metric-title">Errors ({len(errors)})</div>
            {'<br>'.join(f'• {error}' for error in errors)}
        </div>
"""
            
            # Show sample conversation turns if available
            if turns and len(turns) <= 5:  # Only show for shorter conversations
                html += """
        <div class="metric">
            <div class="metric-title">Conversation Sample</div>
"""
                for i, turn in enumerate(turns[:5]):
                    student_input = turn.get('student_input', '')
                    tutor_response = turn.get('tutor_response', '')
                    
                    html += f"""
            <div class="conversation-turn">
                <div class="student">Student:</div>
                <div>{student_input}</div>
                <div class="tutor">Tutor:</div>
                <div>{tutor_response}</div>
            </div>
"""
                
                if len(turns) > 5:
                    html += f"<div><em>... and {len(turns) - 5} more turns</em></div>"
                
                html += "</div>"
            
            elif turns:
                html += f"""
        <div class="metric">
            <div class="metric-title">Conversation Length</div>
            <div>{len(turns)} turns</div>
        </div>
"""
            
            html += "</div>"
        
        return html


def generate_report_from_file(results_file: Path, output_file: Path) -> None:
    """Generate report from a JSON results file."""
    with open(results_file) as f:
        results = json.load(f)
    
    EvalReportGenerator.generate_html_report(results, output_file)
    print(f"Report generated: {output_file}")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) != 3:
        print("Usage: python report_generator.py <results.json> <report.html>")
        sys.exit(1)
    
    results_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    
    generate_report_from_file(results_path, output_path)