"""Scenario execution engine for automated AI tutor evaluation."""

import asyncio
import json
import time
from dataclasses import asdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import websockets
import aiohttp
from datetime import datetime
from openai import OpenAI

from evals.scenarios.basic_scenarios import Scenario, StudentTurn, TutorTurn, ALL_SCENARIOS
from evals.rubrics.socratic_eval import SocraticEvaluator, ConversationEvaluator, AnswerGivingDetector
from evals.analyzers.performance_analyzer import PerformanceAnalyzer, PerformanceMetrics
from backend.app.config import EVAL_LOG_DIR, OPENAI_API_KEY, TUTOR_INSTRUCTIONS
from backend.app.services.eval_logging import log_eval_event


class ScenarioRunner:
    """Executes evaluation scenarios against the AI tutor."""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.socratic_eval = SocraticEvaluator()
        self.conversation_eval = ConversationEvaluator()
        self.performance_analyzer = PerformanceAnalyzer()
        self.openai_client = OpenAI(api_key=OPENAI_API_KEY)
        self._conversation_history: List[Dict[str, str]] = []
        
    async def run_scenario(self, scenario: Scenario, run_id: Optional[str] = None) -> Dict:
        """Execute a single scenario and return evaluation results."""
        if not run_id:
            run_id = f"scenario_{scenario.name}_{int(time.time())}"
            
        log_eval_event("scenario_start", {
            "eval_run_id": run_id,
            "scenario_name": scenario.name,
            "scenario_description": scenario.description
        })
        
        # Reset conversation history for each scenario
        self._conversation_history = []
        
        start_time = time.time()
        results = {
            "run_id": run_id,
            "scenario": scenario.name,
            "started_at": datetime.now().isoformat(),
            "turns": [],
            "socratic_scores": [],
            "performance_metrics": {},
            "overall_evaluation": {},
            "success": False,
            "errors": []
        }
        
        try:
            # Start session
            session_data = await self._create_session(scenario, run_id)
            if not session_data:
                results["errors"].append("Failed to create session")
                return results
            
            # Execute conversation turns
            conversation_turns = []
            for i, (student_turn, expected_tutor) in enumerate(scenario.turns):
                turn_start = time.time()
                
                log_eval_event("turn_start", {
                    "eval_run_id": run_id,
                    "turn_number": i + 1,
                    "student_input": student_turn.text
                })
                
                # Send student input and get tutor response
                tutor_response = await self._simulate_turn(
                    session_data, student_turn, run_id, i + 1
                )
                
                if tutor_response:
                    conversation_turns.append((student_turn.text, tutor_response))
                    
                    # Evaluate turn with Socratic method
                    context = " ".join([f"Student: {s} Tutor: {t}" for s, t in conversation_turns[:-1]])
                    socratic_score = self.socratic_eval.evaluate_turn(
                        student_turn.text, tutor_response, context
                    )
                    
                    # Check expected patterns if provided
                    pattern_check = self._check_expected_patterns(tutor_response, expected_tutor)
                    
                    turn_result = {
                        "turn_number": i + 1,
                        "student_input": student_turn.text,
                        "tutor_response": tutor_response,
                        "socratic_score": asdict(socratic_score),
                        "pattern_check": pattern_check,
                        "duration_ms": (time.time() - turn_start) * 1000
                    }
                    
                    results["turns"].append(turn_result)
                    results["socratic_scores"].append(asdict(socratic_score))
                    
                    log_eval_event("turn_complete", {
                        "eval_run_id": run_id,
                        "turn_number": i + 1,
                        "socratic_overall_score": socratic_score.overall_score,
                        "duration_ms": turn_result["duration_ms"]
                    })
                else:
                    results["errors"].append(f"Failed to get response for turn {i + 1}")
                    
            # Evaluate full conversation
            if conversation_turns:
                conversation_eval = self.conversation_eval.evaluate_conversation(
                    conversation_turns, scenario.initial_topic, scenario.student_level
                )
                results["overall_evaluation"] = conversation_eval
                
            # Analyze performance metrics
            performance = self.performance_analyzer.analyze_run(run_id)
            results["performance_metrics"] = performance.to_dict()
            
            # Check success criteria
            results["success"] = self._check_success_criteria(
                scenario, results["socratic_scores"], conversation_eval, performance
            )
            
            results["total_duration_ms"] = (time.time() - start_time) * 1000
            
        except Exception as e:
            results["errors"].append(f"Scenario execution failed: {str(e)}")
            
        log_eval_event("scenario_complete", {
            "eval_run_id": run_id,
            "success": results["success"],
            "duration_ms": results.get("total_duration_ms", 0),
            "turn_count": len(results["turns"])
        })
        
        return results
    
    async def run_all_scenarios(self, filter_tags: Optional[List[str]] = None) -> Dict:
        """Run all scenarios matching optional tag filter."""
        scenarios_to_run = ALL_SCENARIOS
        
        if filter_tags:
            scenarios_to_run = [
                s for s in ALL_SCENARIOS 
                if s.tags and any(tag in s.tags for tag in filter_tags)
            ]
        
        batch_run_id = f"batch_{int(time.time())}"
        results = {
            "batch_run_id": batch_run_id,
            "started_at": datetime.now().isoformat(),
            "scenarios": [],
            "summary": {}
        }
        
        for scenario in scenarios_to_run:
            scenario_result = await self.run_scenario(scenario, f"{batch_run_id}_{scenario.name}")
            results["scenarios"].append(scenario_result)
        
        # Generate summary statistics
        results["summary"] = self._generate_batch_summary(results["scenarios"])
        
        return results
    
    async def _create_session(self, scenario: Scenario, run_id: str) -> Optional[Dict]:
        """Create a new tutoring session."""
        try:
            log_eval_event("session_create_start", {"eval_run_id": run_id})
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/api/realtime/session",
                    json={
                        "topic_hint": scenario.initial_topic,
                        "student_level": scenario.student_level
                    }
                ) as response:
                    if response.status == 200:
                        session_data = await response.json()
                        log_eval_event("session_create_success", {
                            "eval_run_id": run_id,
                            "session_id": session_data.get("session", {}).get("id", "unknown")
                        })
                        return session_data
                    else:
                        log_eval_event("session_create_failed", {
                            "eval_run_id": run_id,
                            "status": response.status,
                            "error": await response.text()
                        })
                        return None
                        
        except Exception as e:
            log_eval_event("session_create_error", {
                "eval_run_id": run_id,
                "error": str(e)
            })
            return None
    
    async def _simulate_turn(self, session_data: Dict, student_turn: StudentTurn, 
                           run_id: str, turn_number: int) -> Optional[str]:
        """Simulate a single conversation turn using the real OpenAI API."""
        
        try:
            tutor_response = await self._generate_tutor_response(
                student_turn, session_data, run_id, turn_number
            )
            
            return tutor_response
            
        except Exception as e:
            log_eval_event("turn_simulation_error", {
                "eval_run_id": run_id,
                "turn_number": turn_number,
                "error": str(e)
            })
            return None
    
    async def _generate_tutor_response(self, student_turn: StudentTurn, session_data: Dict,
                                    run_id: str, turn_number: int) -> str:
        """Generate tutor response using the real OpenAI API with TUTOR_INSTRUCTIONS."""
        
        # Build system message with session context
        instructions = TUTOR_INSTRUCTIONS
        session_config = session_data.get("session_config", {})
        if session_config.get("instructions"):
            instructions = session_config["instructions"]
        
        # Add student message to conversation history
        self._conversation_history.append({
            "role": "user",
            "content": student_turn.text
        })
        
        messages = [
            {"role": "system", "content": instructions},
            *self._conversation_history
        ]
        
        response = self.openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.7,
            max_tokens=200,
        )
        
        tutor_text = response.choices[0].message.content.strip()
        
        # Add assistant response to conversation history
        self._conversation_history.append({
            "role": "assistant",
            "content": tutor_text
        })
        
        log_eval_event("tutor_response_generated", {
            "eval_run_id": run_id,
            "turn_number": turn_number,
            "response_length": len(tutor_text),
            "contains_question": "?" in tutor_text
        })
        
        return tutor_text
    
    def _check_expected_patterns(self, tutor_response: str, expected: Optional[TutorTurn]) -> Dict:
        """Check if tutor response matches expected patterns."""
        if not expected:
            return {"checked": False}
        
        result = {
            "checked": True,
            "should_contain_passed": True,
            "should_not_contain_passed": True,
            "question_count_passed": True,
            "details": {}
        }
        
        response_lower = tutor_response.lower()
        
        # Check should_contain patterns
        if expected.should_contain:
            missing_patterns = []
            for pattern in expected.should_contain:
                if pattern.lower() not in response_lower:
                    missing_patterns.append(pattern)
            
            result["should_contain_passed"] = len(missing_patterns) == 0
            result["details"]["missing_required"] = missing_patterns
        
        # Check should_not_contain patterns  
        if expected.should_not_contain:
            found_forbidden = []
            for pattern in expected.should_not_contain:
                if pattern.lower() in response_lower:
                    found_forbidden.append(pattern)
            
            result["should_not_contain_passed"] = len(found_forbidden) == 0
            result["details"]["found_forbidden"] = found_forbidden
        
        # Check question count
        if expected.expected_question_count is not None:
            actual_questions = tutor_response.count('?')
            result["question_count_passed"] = actual_questions >= expected.expected_question_count
            result["details"]["expected_questions"] = expected.expected_question_count
            result["details"]["actual_questions"] = actual_questions
        
        return result
    
    def _check_success_criteria(self, scenario: Scenario, socratic_scores: List,
                              conversation_eval: Dict, performance: PerformanceMetrics) -> bool:
        """Check if scenario meets its success criteria."""
        criteria = scenario.success_criteria
        
        # Check Socratic method criteria
        if "max_direct_answers" in criteria:
            answer_giving_scores = [s["answer_giving_score"] for s in socratic_scores]
            avg_answer_giving = sum(answer_giving_scores) / len(answer_giving_scores) if answer_giving_scores else 1.0
            if avg_answer_giving > criteria["max_direct_answers"]:
                return False
        
        if "min_questions_per_turn" in criteria:
            avg_question_score = sum(s["question_quality_score"] for s in socratic_scores) / len(socratic_scores)
            if avg_question_score < criteria["min_questions_per_turn"]:
                return False
        
        # Check conversation quality
        if "context_retention" in criteria:
            if conversation_eval.get("context_retention_score", 0) < criteria["context_retention"]:
                return False
        
        # Check performance criteria (skip if metrics not available, e.g. text-only simulation)
        if "avg_response_time_ms" in criteria:
            if performance.avg_response_latency_ms is not None and performance.avg_response_latency_ms > criteria["avg_response_time_ms"]:
                return False
        
        if "max_response_time_ms" in criteria:
            if performance.p95_response_latency_ms is not None and performance.p95_response_latency_ms > criteria["max_response_time_ms"]:
                return False
        
        return True
    
    def _generate_batch_summary(self, scenario_results: List[Dict]) -> Dict:
        """Generate summary statistics for a batch of scenarios."""
        if not scenario_results:
            return {}
        
        total_scenarios = len(scenario_results)
        successful_scenarios = sum(1 for r in scenario_results if r["success"])
        
        # Average Socratic scores
        all_socratic_scores = []
        for result in scenario_results:
            all_socratic_scores.extend(result.get("socratic_scores", []))
        
        avg_socratic = {
            "answer_giving": sum(s["answer_giving_score"] for s in all_socratic_scores) / len(all_socratic_scores) if all_socratic_scores else 0,
            "question_quality": sum(s["question_quality_score"] for s in all_socratic_scores) / len(all_socratic_scores) if all_socratic_scores else 0,
            "guidance_effectiveness": sum(s["guidance_effectiveness_score"] for s in all_socratic_scores) / len(all_socratic_scores) if all_socratic_scores else 0,
            "overall": sum(s["overall_score"] for s in all_socratic_scores) / len(all_socratic_scores) if all_socratic_scores else 0
        }
        
        # Performance aggregates
        all_ttff = [r["performance_metrics"].get("ttff_ms") for r in scenario_results if r["performance_metrics"].get("ttff_ms")]
        all_latency = [r["performance_metrics"].get("avg_latency_ms") for r in scenario_results if r["performance_metrics"].get("avg_latency_ms")]
        
        return {
            "total_scenarios": total_scenarios,
            "successful_scenarios": successful_scenarios,
            "success_rate": successful_scenarios / total_scenarios,
            "avg_socratic_scores": avg_socratic,
            "avg_ttff_ms": sum(all_ttff) / len(all_ttff) if all_ttff else None,
            "avg_response_latency_ms": sum(all_latency) / len(all_latency) if all_latency else None,
            "total_turns": sum(len(r["turns"]) for r in scenario_results),
            "total_errors": sum(len(r["errors"]) for r in scenario_results)
        }