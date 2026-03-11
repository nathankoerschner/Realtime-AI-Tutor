# AI Tutor Evaluation Framework Usage Guide

This guide shows how to use the comprehensive evaluation framework for the AI tutor project.

## Quick Start

### Run All Evaluations
```bash
python scripts/run-evals.py run
```

### Run Specific Scenarios
```bash
python scripts/run-evals.py run --scenarios photosynthesis_discovery algebra_wrong_answer
```

### Filter by Tags
```bash
python scripts/run-evals.py run --tags socratic math
```

### Analyze Performance
```bash
python scripts/run-evals.py analyze --hours 24
python scripts/run-evals.py analyze --run-id eval_20240310_001
```

### List Available Scenarios
```bash
python scripts/run-evals.py list
```

## Evaluation Types

### 1. Performance Metrics
- **Time to First Frame (TTFF)**: WebRTC connection to first audio
- **Response Latency**: User speech end to tutor response start  
- **Audio Quality**: Roundtrip latency, connection success rate
- **UI Responsiveness**: Animation smoothness, interaction response times

### 2. Socratic Method Effectiveness
- **Answer-Giving Detection**: Automatically flags direct answer reveals
- **Question Quality**: Evaluates pedagogical value of tutor questions
- **Guidance Effectiveness**: Measures how well tutor guides discovery
- **Encouragement Score**: Warmth and support in tutor responses

### 3. Conversation Quality
- **Context Retention**: How well tutor maintains topic focus over long conversations
- **Adaptability**: Tutor adjustment to student understanding signals
- **Coherence**: Logical flow and consistency across dialogue
- **Educational Progression**: Movement from confusion to understanding

## Creating Custom Scenarios

### Basic Scenario Structure
```python
from evals.scenarios.basic_scenarios import Scenario, StudentTurn, TutorTurn

my_scenario = Scenario(
    name="custom_chemistry_test",
    description="Test understanding of chemical bonds",
    initial_topic="ionic and covalent bonds",
    student_level="grade 10",
    turns=[
        (StudentTurn("What's the difference between ionic and covalent bonds?"),
         TutorTurn("", should_contain=["what do you think", "how might"],
                      should_not_contain=["ionic bonds are", "electrons transfer"])),
        # Add more turns...
    ],
    success_criteria={
        "max_direct_answers": 0,
        "min_questions_per_turn": 1,
        "avg_response_time_ms": 2000
    },
    tags=["socratic", "chemistry", "bonds"]
)
```

### Expected Patterns
- `should_contain`: Phrases the tutor response should include
- `should_not_contain`: Anti-patterns (direct answers, corrections)
- `expected_question_count`: Minimum number of questions per response

### Success Criteria
- `max_direct_answers`: Maximum answer-giving score (0-1, lower better)
- `min_questions_per_turn`: Minimum question quality score
- `context_retention`: Required context retention score (0-1)
- `avg_response_time_ms`: Maximum average response time
- `max_response_time_ms`: Maximum P95 response time

## Frontend Integration

The evaluation framework automatically collects metrics during actual usage:

### Session Lifecycle
```javascript
// Automatically tracked when using EvalCollector
evalCollector.markSessionStart();
evalCollector.markConnectionAttempt();
evalCollector.markConnectionSuccess();
evalCollector.markFirstAudioFrame();
```

### Performance Tracking
```javascript
// Timer-based measurements
evalCollector.startTimer('user_response');
// ... user interaction ...
evalCollector.endTimer('user_response');

// Direct measurements
evalCollector.markSpeechStart();
evalCollector.markSpeechEnd();
evalCollector.markTutorResponseStart();
```

### Error Tracking
```javascript
evalCollector.markError('connection', 'WebRTC failed', {
    attempt: 3,
    browser: 'Chrome'
});
```

## Custom Evaluators

### LLM-Based Evaluation
```python
from evals.rubrics.socratic_eval import SocraticEvaluator

evaluator = SocraticEvaluator()
score = evaluator.evaluate_turn(
    student_input="I don't understand photosynthesis",
    tutor_response="What do you already know about how plants get energy?",
    context="Previous conversation about plant biology"
)

print(f"Question Quality: {score.question_quality_score}")
print(f"Answer Giving: {score.answer_giving_score}")
```

### Pattern-Based Detection
```python
from evals.rubrics.socratic_eval import AnswerGivingDetector

# Check for direct answers
direct_answers = AnswerGivingDetector.detect_direct_answers(
    "Photosynthesis is the process where plants make glucose using sunlight."
)

# Check for guiding questions
has_questions = AnswerGivingDetector.has_guiding_questions(
    "What do you think plants need to make their own food?"
)
```

## Report Generation

### Automatic HTML Reports
```bash
python scripts/run-evals.py run --output results.json
python evals/analyzers/report_generator.py results.json report.html
```

### Custom Analysis
```python
from evals.analyzers.performance_analyzer import PerformanceAnalyzer

analyzer = PerformanceAnalyzer()
metrics = analyzer.analyze_run("eval_20240310_001")

print(f"TTFF: {metrics.time_to_first_frame_ms}ms")
print(f"Avg Latency: {metrics.avg_response_latency_ms}ms")
```

## Integration with CI/CD

### GitHub Actions Example
```yaml
- name: Run Evaluations
  run: |
    python scripts/run-evals.py run --tags smoke_test --output results.json
    python evals/analyzers/report_generator.py results.json eval_report.html

- name: Upload Results
  uses: actions/upload-artifact@v3
  with:
    name: evaluation-report
    path: eval_report.html
```

### Performance Regression Testing
```bash
# Run after each deployment
python scripts/run-evals.py run --tags performance --output latest.json

# Compare with baseline
python -m evals.analyzers.compare_runs baseline.json latest.json
```

## Advanced Usage

### Batch Evaluation
```python
from evals.runners.scenario_runner import ScenarioRunner

runner = ScenarioRunner()
results = await runner.run_all_scenarios(filter_tags=["regression"])

for scenario_result in results["scenarios"]:
    if not scenario_result["success"]:
        print(f"FAILED: {scenario_result['scenario']}")
        for error in scenario_result["errors"]:
            print(f"  {error}")
```

### Custom Performance Metrics
```python
from evals.analyzers.performance_analyzer import PerformanceAnalyzer

class CustomAnalyzer(PerformanceAnalyzer):
    def compute_custom_metrics(self, events):
        # Add domain-specific metrics
        educational_effectiveness = self.analyze_learning_progression(events)
        engagement_score = self.analyze_student_engagement(events)
        return {"educational": educational_effectiveness, "engagement": engagement_score}
```

## Troubleshooting

### Common Issues

1. **No evaluation data found**
   - Check that `EVAL_LOG_DIR` is set correctly
   - Ensure frontend `EvalCollector` is properly initialized

2. **OpenAI API errors in Socratic evaluation**
   - Verify `OPENAI_API_KEY` is set
   - Check API quota and rate limits

3. **Scenario execution failures**
   - Ensure backend is running on correct port
   - Check WebRTC/session creation endpoints

4. **Missing dependencies**
   ```bash
   cd backend && uv sync
   pip install openai aiohttp websockets
   ```

### Debug Mode
```bash
# Run with verbose logging
EVAL_DEBUG=1 python scripts/run-evals.py run --scenarios debug_test
```

## Best Practices

1. **Start Small**: Begin with simple scenarios, then add complexity
2. **Tag Everything**: Use consistent tagging for easy filtering
3. **Monitor Trends**: Run evaluations regularly to catch regressions
4. **Balance Automation**: Combine automated evaluation with human review
5. **Iterate on Criteria**: Refine success criteria based on results
6. **Document Edge Cases**: Create scenarios for discovered issues
