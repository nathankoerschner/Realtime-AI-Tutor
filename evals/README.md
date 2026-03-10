# AI Tutor Evaluation Framework

This directory contains the evaluation infrastructure for the AI Tutor project, measuring performance, pedagogical effectiveness, and conversation quality.

## Structure

- `scenarios/` - Predefined conversation flows and test cases
- `rubrics/` - LLM-based evaluation criteria and prompts
- `runners/` - Test execution engines and automation
- `analyzers/` - Data analysis, reporting, and metrics computation
- `datasets/` - Example conversations and training data
- `runs/` - Evaluation run logs (auto-generated)

## Key Metrics

1. **Performance**: Time to first frame, audio latency, UI responsiveness
2. **Socratic Method**: Answer-giving detection, question quality, guidance effectiveness
3. **Conversation Quality**: Context retention, coherence, adaptability
4. **Educational Outcomes**: Concept progression, understanding assessment

## Usage

Run all evals:
```bash
python -m evals.runners.full_suite
```

Run specific evaluators:
```bash
python -m evals.runners.socratic_eval --scenario basic_math
python -m evals.runners.performance_eval --duration 60
```

Analyze results:
```bash
python -m evals.analyzers.report_generator --run-id eval_20240310_001
```