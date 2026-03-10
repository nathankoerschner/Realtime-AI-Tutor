"""LLM-based evaluators for Socratic method effectiveness."""

import json
import re
from typing import Dict, List, Optional
from dataclasses import dataclass
from openai import OpenAI

from backend.app.config import OPENAI_API_KEY


@dataclass
class SocraticScore:
    """Result of Socratic method evaluation."""
    answer_giving_score: float  # 0-1, lower is better (0 = no direct answers)
    question_quality_score: float  # 0-1, higher is better
    guidance_effectiveness_score: float  # 0-1, higher is better
    encouragement_score: float  # 0-1, higher is better
    overall_score: float  # weighted combination
    reasoning: str  # explanation of scoring
    flags: List[str]  # specific issues found


class SocraticEvaluator:
    """Evaluates tutor responses for Socratic method adherence."""
    
    def __init__(self, api_key: str = OPENAI_API_KEY):
        self.client = OpenAI(api_key=api_key)
    
    def evaluate_turn(self, student_input: str, tutor_response: str, context: str = "") -> SocraticScore:
        """Evaluate a single tutor response for Socratic method effectiveness."""
        
        prompt = self._build_evaluation_prompt(student_input, tutor_response, context)
        
        try:
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": self._get_system_prompt()},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            
            raw_content = response.choices[0].message.content.strip()
            # Strip markdown code fences if present
            if raw_content.startswith("```"):
                raw_content = re.sub(r"^```(?:json)?\s*\n?", "", raw_content)
                raw_content = re.sub(r"\n?```\s*$", "", raw_content)
            result = json.loads(raw_content)
            return SocraticScore(
                answer_giving_score=result["answer_giving_score"],
                question_quality_score=result["question_quality_score"],  
                guidance_effectiveness_score=result["guidance_effectiveness_score"],
                encouragement_score=result["encouragement_score"],
                overall_score=result["overall_score"],
                reasoning=result["reasoning"],
                flags=result["flags"]
            )
            
        except Exception as e:
            return SocraticScore(
                answer_giving_score=0.5,
                question_quality_score=0.5,
                guidance_effectiveness_score=0.5,
                encouragement_score=0.5,
                overall_score=0.5,
                reasoning=f"Evaluation failed: {str(e)}",
                flags=["evaluation_error"]
            )
    
    def _get_system_prompt(self) -> str:
        return """You are an expert in the Socratic method of teaching. Your job is to evaluate AI tutor responses for their adherence to Socratic principles.

The Socratic method involves:
- Asking guiding questions rather than giving direct answers
- Leading students to discover answers themselves
- Building on student responses with follow-up questions
- Providing encouragement while maintaining challenge
- Not correcting errors directly, but guiding toward self-correction

Rate each aspect on a 0-1 scale and provide specific reasoning."""

    def _build_evaluation_prompt(self, student_input: str, tutor_response: str, context: str) -> str:
        return f"""Evaluate this tutor response for Socratic method effectiveness:

CONTEXT: {context if context else "None"}
STUDENT: {student_input}
TUTOR: {tutor_response}

Provide your evaluation as JSON with this exact format:
{{
  "answer_giving_score": 0.0-1.0 (0=no direct answers, 1=gives away answers),
  "question_quality_score": 0.0-1.0 (quality of guiding questions),
  "guidance_effectiveness_score": 0.0-1.0 (how well it guides discovery),
  "encouragement_score": 0.0-1.0 (warmth and encouragement level),
  "overall_score": 0.0-1.0 (weighted average: 30% answer_giving(inverted), 25% question_quality, 25% guidance, 20% encouragement),
  "reasoning": "Brief explanation of scores",
  "flags": ["specific_issues_found"]
}}

Examples of flags: "gives_direct_answer", "poor_question", "discouraging_tone", "misses_student_cue", "too_advanced", "too_basic"."""


class ConversationEvaluator:
    """Evaluates full conversations for coherence and educational progression."""
    
    def __init__(self, api_key: str = OPENAI_API_KEY):
        self.client = OpenAI(api_key=api_key)
    
    def evaluate_conversation(self, turns: List[tuple[str, str]], topic: str, student_level: str) -> Dict:
        """Evaluate an entire conversation for educational effectiveness."""
        
        conversation_text = self._format_conversation(turns)
        
        prompt = f"""Evaluate this tutoring conversation for educational effectiveness:

TOPIC: {topic}
STUDENT_LEVEL: {student_level}
CONVERSATION:
{conversation_text}

Provide evaluation as JSON:
{{
  "context_retention_score": 0.0-1.0 (how well context is maintained),
  "concept_progression_score": 0.0-1.0 (logical building of understanding),
  "adaptability_score": 0.0-1.0 (adaptation to student responses),
  "coherence_score": 0.0-1.0 (logical flow and consistency),
  "engagement_score": 0.0-1.0 (student engagement and participation),
  "overall_effectiveness": 0.0-1.0 (overall educational value),
  "key_strengths": ["strength1", "strength2"],
  "areas_for_improvement": ["improvement1", "improvement2"],
  "learning_outcomes_achieved": ["outcome1", "outcome2"]
}}"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert educational evaluator. Assess tutoring conversations for pedagogical effectiveness. Respond with ONLY valid JSON, no markdown formatting."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            
            raw_content = response.choices[0].message.content.strip()
            if raw_content.startswith("```"):
                raw_content = re.sub(r"^```(?:json)?\s*\n?", "", raw_content)
                raw_content = re.sub(r"\n?```\s*$", "", raw_content)
            return json.loads(raw_content)
            
        except Exception as e:
            return {
                "context_retention_score": 0.5,
                "concept_progression_score": 0.5,
                "adaptability_score": 0.5,
                "coherence_score": 0.5,
                "engagement_score": 0.5,
                "overall_effectiveness": 0.5,
                "key_strengths": [],
                "areas_for_improvement": [f"Evaluation failed: {str(e)}"],
                "learning_outcomes_achieved": []
            }
    
    def _format_conversation(self, turns: List[tuple[str, str]]) -> str:
        """Format conversation turns for evaluation."""
        formatted = []
        for i, (student, tutor) in enumerate(turns, 1):
            formatted.append(f"Turn {i}:")
            formatted.append(f"Student: {student}")
            formatted.append(f"Tutor: {tutor}")
            formatted.append("")
        return "\n".join(formatted)


class AnswerGivingDetector:
    """Specialized detector for direct answer giving (anti-Socratic behavior)."""
    
    # Patterns that indicate direct answer giving
    DIRECT_ANSWER_PATTERNS = [
        r"the answer is",
        r"it equals?",
        r"the result is",
        r"the correct answer",
        r"^(yes,?\s*)?(it'?s|that'?s)\s+(correct|right|wrong)",
        r"no,?\s+it'?s\s+actually",
        r"^(photosynthesis|mitochondria|nucleus|chloroplast)\s+(is|are|does)",
        r"x\s*=\s*\d+",
        r"the formula is",
        r"plants make food",
    ]
    
    @classmethod
    def detect_direct_answers(cls, tutor_response: str) -> List[str]:
        """Detect direct answer giving in tutor response."""
        detected = []
        response_lower = tutor_response.lower()
        
        for pattern in cls.DIRECT_ANSWER_PATTERNS:
            if re.search(pattern, response_lower):
                detected.append(pattern)
                
        return detected
    
    @classmethod
    def has_guiding_questions(cls, tutor_response: str) -> bool:
        """Check if response contains guiding questions."""
        question_count = tutor_response.count('?')
        question_words = ['what', 'why', 'how', 'when', 'where', 'which']
        
        response_lower = tutor_response.lower()
        guiding_questions = sum(1 for word in question_words if word in response_lower and '?' in tutor_response)
        
        return question_count > 0 and guiding_questions > 0