"""Basic evaluation scenarios for testing AI tutor behavior."""

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class StudentTurn:
    """A single student input in a conversation."""
    text: str
    audio_duration_ms: Optional[int] = None
    hesitation_markers: List[str] = None  # "um", "uh", etc.
    confidence_level: str = "medium"  # low, medium, high


@dataclass
class TutorTurn:
    """Expected or actual tutor response."""
    text: str
    should_contain: List[str] = None  # Expected phrases/patterns
    should_not_contain: List[str] = None  # Anti-patterns (direct answers)
    expected_question_count: Optional[int] = None


@dataclass
class Scenario:
    """A complete evaluation scenario."""
    name: str
    description: str
    initial_topic: str
    student_level: str
    turns: List[tuple[StudentTurn, Optional[TutorTurn]]]
    success_criteria: dict
    tags: List[str] = None


# Socratic Method Test Scenarios
PHOTOSYNTHESIS_DISCOVERY = Scenario(
    name="photosynthesis_discovery",
    description="Student discovers photosynthesis concept through guided questions",
    initial_topic="photosynthesis", 
    student_level="grade 8",
    turns=[
        (StudentTurn("I don't understand how plants eat"), 
         TutorTurn("", should_contain=["question"], should_not_contain=["plants make food", "glucose"])),
        
        (StudentTurn("Um, through their roots?"), 
         TutorTurn("", should_contain=["what else", "also", "roots are"], should_not_contain=["wrong", "no"])),
        
        (StudentTurn("Maybe through their leaves too?"), 
         TutorTurn("", should_contain=["excellent", "what do", "how might"], expected_question_count=1)),
        
        (StudentTurn("The leaves take in something from the air?"), 
         TutorTurn("", should_contain=["great thinking", "what from the air"], should_not_contain=["carbon dioxide"])),
        
        (StudentTurn("I think carbon dioxide"), 
         TutorTurn("", should_contain=["yes", "what else", "what do plants need"], should_not_contain=["that's correct", "exactly right"])),
    ],
    success_criteria={
        "max_direct_answers": 0.2,
        "min_questions_per_turn": 0.7,
        "discovery_progression": True,
        "encouragement_present": True
    },
    tags=["socratic", "science", "discovery"]
)

ALGEBRA_WRONG_ANSWER = Scenario(
    name="algebra_wrong_answer",
    description="Student gives wrong answer, tutor guides without direct correction",
    initial_topic="solving linear equations",
    student_level="grade 9", 
    turns=[
        (StudentTurn("Can you help me solve 2x + 5 = 15?"),
         TutorTurn("", should_contain=["what", "first step", "how"], should_not_contain=["x = 5", "subtract 5"])),
        
        (StudentTurn("I think x equals 10"),
         TutorTurn("", should_contain=["let's check", "substitute", "try"], should_not_contain=["wrong", "incorrect", "no that's"])),
        
        (StudentTurn("Oh wait, let me try again"),
         TutorTurn("", should_contain=["great", "what would", "how"], should_not_contain=["x = 5"])),
    ],
    success_criteria={
        "no_direct_correction": True,
        "guides_self_discovery": True,
        "maintains_encouragement": True
    },
    tags=["socratic", "math", "error_handling"]
)

EXTENDED_CONVERSATION = Scenario(
    name="extended_conversation", 
    description="15-turn conversation testing context retention and adaptation",
    initial_topic="cell structure",
    student_level="grade 7",
    turns=[
        # Initial setup
        (StudentTurn("What's inside a cell?"), None),
        (StudentTurn("Like a nucleus?"), None),
        (StudentTurn("What does it do?"), None),
        
        # Deepen understanding
        (StudentTurn("Is it like the brain?"), None),
        (StudentTurn("What else is in there?"), None),
        (StudentTurn("Mitochondria?"), None),
        
        # Test context retention 
        (StudentTurn("Wait, go back to the nucleus thing"), None),
        (StudentTurn("Does it control the mitochondria too?"), None),
        
        # Apply to new context
        (StudentTurn("Do plant cells have the same stuff?"), None),
        (StudentTurn("What's different about them?"), None),
        (StudentTurn("Chloroplasts?"), None),
        
        # Synthesize knowledge
        (StudentTurn("So the nucleus controls everything in both?"), None),
        (StudentTurn("Can you give me a quick summary?"), None),
        (StudentTurn("How does this relate to photosynthesis?"), None),
        (StudentTurn("That makes sense now!"), None),
    ],
    success_criteria={
        "context_retention": 0.8,  # 80% of references maintained
        "concept_connections": 3,   # Links between concepts
        "builds_on_prior_turns": True,
        "adapts_to_understanding": True
    },
    tags=["extended", "context", "science", "synthesis"]
)

# Performance test scenario
QUICK_RESPONSE_TEST = Scenario(
    name="quick_response_test",
    description="Tests system responsiveness under rapid conversation",
    initial_topic="fractions",
    student_level="grade 6",
    turns=[
        (StudentTurn("What's 1/2 + 1/4?"), None),
        (StudentTurn("I don't know"), None), 
        (StudentTurn("Two fourths?"), None),
        (StudentTurn("Plus one fourth?"), None),
        (StudentTurn("Three fourths!"), None),
    ],
    success_criteria={
        "avg_response_time_ms": 1500,
        "max_response_time_ms": 3000,
        "no_timeouts": True
    },
    tags=["performance", "math", "rapid_fire"]
)

# All scenarios for easy iteration
ALL_SCENARIOS = [
    PHOTOSYNTHESIS_DISCOVERY,
    ALGEBRA_WRONG_ANSWER,
    EXTENDED_CONVERSATION,
    QUICK_RESPONSE_TEST
]