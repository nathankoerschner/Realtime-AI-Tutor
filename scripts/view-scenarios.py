#!/usr/bin/env python3
"""View and explore evaluation scenarios in detail."""

import sys
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from evals.scenarios.basic_scenarios import ALL_SCENARIOS


def print_scenario_details(scenario, show_turns=True):
    """Print detailed information about a scenario."""
    print(f"🎯 **{scenario.name.replace('_', ' ').title()}**")
    print(f"   📝 Description: {scenario.description}")
    print(f"   📚 Topic: {scenario.initial_topic}")
    print(f"   👥 Level: {scenario.student_level}")
    print(f"   🏷️  Tags: {', '.join(scenario.tags) if scenario.tags else 'None'}")
    print(f"   💬 Turns: {len(scenario.turns)}")
    print()
    
    if show_turns:
        print("   **Expected Conversation Flow:**")
        for i, (student_turn, expected_tutor) in enumerate(scenario.turns, 1):
            print(f"   Turn {i}:")
            print(f"     👤 Student: \"{student_turn.text}\"")
            
            if expected_tutor:
                expectations = []
                if expected_tutor.should_contain:
                    expectations.append(f"Should contain: {expected_tutor.should_contain}")
                if expected_tutor.should_not_contain:
                    expectations.append(f"Should NOT contain: {expected_tutor.should_not_contain}")
                if expected_tutor.expected_question_count:
                    expectations.append(f"Min questions: {expected_tutor.expected_question_count}")
                
                if expectations:
                    print(f"     🤖 Tutor expectations: {'; '.join(expectations)}")
                else:
                    print(f"     🤖 Tutor: (No specific expectations)")
            else:
                print(f"     🤖 Tutor: (No expectations defined)")
            print()
    
    print("   **Success Criteria:**")
    for key, value in scenario.success_criteria.items():
        print(f"     ✓ {key}: {value}")
    print()
    print("=" * 80)
    print()


def show_scenario_summary():
    """Show a quick summary of all scenarios."""
    print("📋 **Available Evaluation Scenarios**")
    print("=" * 50)
    print()
    
    by_tag = {}
    for scenario in ALL_SCENARIOS:
        for tag in scenario.tags or ['untagged']:
            if tag not in by_tag:
                by_tag[tag] = []
            by_tag[tag].append(scenario)
    
    for tag, scenarios in by_tag.items():
        print(f"🏷️  **{tag.title()} ({len(scenarios)} scenarios)**")
        for scenario in scenarios:
            print(f"   • {scenario.name}: {scenario.description}")
        print()


def show_detailed_scenario(scenario_name):
    """Show detailed view of a specific scenario."""
    scenario = next((s for s in ALL_SCENARIOS if s.name == scenario_name), None)
    if not scenario:
        print(f"❌ Scenario '{scenario_name}' not found!")
        print(f"Available scenarios: {[s.name for s in ALL_SCENARIOS]}")
        return
    
    print_scenario_details(scenario, show_turns=True)


def show_all_detailed():
    """Show detailed view of all scenarios."""
    print(f"📚 **Complete Evaluation Scenario Library ({len(ALL_SCENARIOS)} scenarios)**")
    print("=" * 80)
    print()
    
    for scenario in ALL_SCENARIOS:
        print_scenario_details(scenario, show_turns=True)


def show_creation_guide():
    """Show how to create custom scenarios."""
    print("""
🛠️  **How to Create Custom Evaluation Scenarios**

1. **Basic Structure:**
```python
from evals.scenarios.basic_scenarios import Scenario, StudentTurn, TutorTurn

my_scenario = Scenario(
    name="my_custom_test",
    description="Tests specific tutoring behavior",
    initial_topic="your subject here",
    student_level="grade X",
    turns=[
        (StudentTurn("Student question/response"), 
         TutorTurn("", 
                   should_contain=["phrases tutor should use"],
                   should_not_contain=["anti-patterns to avoid"],
                   expected_question_count=1)),
        # Add more turns...
    ],
    success_criteria={
        "max_direct_answers": 0.0,        # 0-1 score, lower = better
        "min_questions_per_turn": 1,      # Quality threshold
        "avg_response_time_ms": 2000      # Performance requirement
    },
    tags=["custom", "subject", "type"]
)
```

2. **Student Turn Options:**
```python
StudentTurn(
    text="What the student says",
    audio_duration_ms=2500,              # Optional: simulated speech time
    hesitation_markers=["um", "uh"],     # Optional: uncertainty signals
    confidence_level="low"               # low/medium/high
)
```

3. **Tutor Expectations:**
```python
TutorTurn(
    text="",  # Leave empty for auto-generation
    should_contain=["what do you think", "how might"],     # Required phrases
    should_not_contain=["the answer is", "x equals"],      # Forbidden phrases  
    expected_question_count=2                              # Min questions
)
```

4. **Success Criteria Options:**
- `max_direct_answers`: Max answer-giving score (0-1, lower better)
- `min_questions_per_turn`: Min question quality score (0-1)
- `context_retention`: Min context score for long conversations (0-1)  
- `avg_response_time_ms`: Max average response time
- `max_response_time_ms`: Max P95 response time
- `discovery_progression`: Must show learning progression (True/False)
- `encouragement_present`: Must include encouragement (True/False)

5. **Add to Collection:**
```python
# Add to basic_scenarios.py
MY_NEW_SCENARIOS = [my_scenario, another_scenario]
ALL_SCENARIOS.extend(MY_NEW_SCENARIOS)
```

6. **Test Your Scenario:**
```bash
python scripts/run-evals.py run --scenarios my_custom_test
```
""")


def main():
    """Main CLI for viewing scenarios."""
    if len(sys.argv) == 1:
        show_scenario_summary()
        print("\n💡 **Usage:**")
        print("  python scripts/view-scenarios.py summary          # Quick overview")
        print("  python scripts/view-scenarios.py detailed         # All scenarios with turns")
        print("  python scripts/view-scenarios.py <scenario_name>  # Specific scenario details")
        print("  python scripts/view-scenarios.py create           # How to create custom scenarios")
        return
    
    command = sys.argv[1].lower()
    
    if command == "summary":
        show_scenario_summary()
    elif command == "detailed":
        show_all_detailed()
    elif command == "create":
        show_creation_guide()
    else:
        # Assume it's a scenario name
        show_detailed_scenario(command)


if __name__ == "__main__":
    main()