"""Performance analysis tools for AI tutor evaluation."""

import json
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime

from backend.app.config import EVAL_LOG_DIR


@dataclass
class PerformanceMetrics:
    """Performance metrics for a session or eval run."""
    time_to_first_frame_ms: Optional[float] = None
    avg_response_latency_ms: Optional[float] = None
    p95_response_latency_ms: Optional[float] = None
    audio_latency_ms: Optional[float] = None
    ui_responsiveness_score: float = 1.0  # 0-1
    connection_success_rate: float = 1.0  # 0-1
    error_count: int = 0
    session_duration_ms: Optional[float] = None
    
    def to_dict(self) -> Dict:
        return {
            'ttff_ms': self.time_to_first_frame_ms,
            'avg_latency_ms': self.avg_response_latency_ms,
            'p95_latency_ms': self.p95_response_latency_ms,
            'audio_latency_ms': self.audio_latency_ms,
            'ui_score': self.ui_responsiveness_score,
            'connection_rate': self.connection_success_rate,
            'errors': self.error_count,
            'duration_ms': self.session_duration_ms
        }


class PerformanceAnalyzer:
    """Analyzes performance metrics from eval logs."""
    
    def __init__(self, eval_log_dir: Path = EVAL_LOG_DIR):
        self.eval_log_dir = eval_log_dir
    
    def analyze_run(self, run_id: str) -> PerformanceMetrics:
        """Analyze performance metrics for a specific eval run."""
        events = self._load_events_for_run(run_id)
        return self._compute_metrics(events)
    
    def analyze_recent_runs(self, hours: int = 24) -> Dict[str, PerformanceMetrics]:
        """Analyze performance metrics for recent runs."""
        cutoff = datetime.now().timestamp() - (hours * 3600)
        all_runs = {}
        
        for log_file in self.eval_log_dir.glob("*.jsonl"):
            with open(log_file, 'r') as f:
                for line in f:
                    try:
                        event = json.loads(line.strip())
                        timestamp = datetime.fromisoformat(event.get('timestamp', '')).timestamp()
                        
                        if timestamp >= cutoff and 'eval_run_id' in event:
                            run_id = event['eval_run_id']
                            if run_id not in all_runs:
                                all_runs[run_id] = []
                            all_runs[run_id].append(event)
                    except (json.JSONDecodeError, ValueError, TypeError):
                        continue
        
        return {run_id: self._compute_metrics(events) for run_id, events in all_runs.items()}
    
    def _load_events_for_run(self, run_id: str) -> List[Dict]:
        """Load all events for a specific run ID."""
        events = []
        
        for log_file in self.eval_log_dir.glob("*.jsonl"):
            with open(log_file, 'r') as f:
                for line in f:
                    try:
                        event = json.loads(line.strip())
                        if event.get('eval_run_id') == run_id:
                            events.append(event)
                    except json.JSONDecodeError:
                        continue
        
        return sorted(events, key=lambda e: e.get('at_ms', 0))
    
    def _compute_metrics(self, events: List[Dict]) -> PerformanceMetrics:
        """Compute performance metrics from event list."""
        if not events:
            return PerformanceMetrics()
        
        metrics = PerformanceMetrics()
        
        # Time to first frame
        ttff_events = [e for e in events if e.get('name') == 'first_audio_frame']
        if ttff_events:
            metrics.time_to_first_frame_ms = ttff_events[0].get('at_ms')
        
        # Response latencies
        response_times = []
        for event in events:
            if event.get('name') == 'tutor_response_start':
                response_time = event.get('meta', {}).get('response_latency_ms')
                if response_time:
                    response_times.append(response_time)
        
        if response_times:
            metrics.avg_response_latency_ms = statistics.mean(response_times)
            metrics.p95_response_latency_ms = self._percentile(response_times, 95)
        
        # Audio latency
        audio_events = [e for e in events if e.get('name') == 'audio_roundtrip']
        if audio_events:
            latencies = [e.get('meta', {}).get('latency_ms') for e in audio_events if e.get('meta', {}).get('latency_ms')]
            if latencies:
                metrics.audio_latency_ms = statistics.mean(latencies)
        
        # UI responsiveness (based on animation frame timing)
        ui_events = [e for e in events if e.get('name', '').startswith('ui_')]
        slow_ui_count = sum(1 for e in ui_events if e.get('meta', {}).get('duration_ms', 0) > 16.7)  # >1 frame
        metrics.ui_responsiveness_score = max(0, 1 - (slow_ui_count / max(len(ui_events), 1)))
        
        # Connection success rate
        connection_attempts = len([e for e in events if e.get('name') == 'connection_attempt'])
        connection_successes = len([e for e in events if e.get('name') == 'connection_success'])
        if connection_attempts > 0:
            metrics.connection_success_rate = connection_successes / connection_attempts
        
        # Error count
        metrics.error_count = len([e for e in events if e.get('name', '').startswith('error_')])
        
        # Session duration
        session_events = [e for e in events if e.get('name') in ['session_start', 'session_end']]
        if len(session_events) >= 2:
            start = min(e.get('at_ms', float('inf')) for e in session_events if e.get('name') == 'session_start')
            end = max(e.get('at_ms', 0) for e in session_events if e.get('name') == 'session_end')
            if start != float('inf'):
                metrics.session_duration_ms = end - start
        
        return metrics
    
    def _percentile(self, data: List[float], p: int) -> float:
        """Calculate percentile of data."""
        if not data:
            return 0.0
        sorted_data = sorted(data)
        index = (p / 100) * (len(sorted_data) - 1)
        if index.is_integer():
            return sorted_data[int(index)]
        else:
            lower = sorted_data[int(index)]
            upper = sorted_data[int(index) + 1]
            return lower + (upper - lower) * (index - int(index))


class LatencyTracker:
    """Helper for tracking specific latency measurements."""
    
    @staticmethod
    def track_connection_latency(start_time: float, end_time: float) -> Dict:
        """Track WebRTC connection establishment latency."""
        return {
            'name': 'connection_latency',
            'at_ms': end_time - start_time,
            'meta': {
                'connection_start': start_time,
                'connection_end': end_time,
                'latency_ms': end_time - start_time
            }
        }
    
    @staticmethod
    def track_audio_roundtrip(speech_end: float, response_start: float, 
                            user_audio_duration: float) -> Dict:
        """Track audio processing roundtrip time."""
        total_latency = response_start - speech_end
        return {
            'name': 'audio_roundtrip', 
            'at_ms': response_start,
            'meta': {
                'speech_end_time': speech_end,
                'response_start_time': response_start,
                'user_speech_duration_ms': user_audio_duration,
                'latency_ms': total_latency,
                'perceived_latency_ms': total_latency + user_audio_duration
            }
        }
    
    @staticmethod
    def track_ui_animation(animation_name: str, duration_ms: float) -> Dict:
        """Track UI animation performance."""
        return {
            'name': f'ui_animation_{animation_name}',
            'at_ms': duration_ms,
            'meta': {
                'animation': animation_name,
                'duration_ms': duration_ms,
                'target_60fps': duration_ms <= 16.7,
                'smooth': duration_ms <= 33.3  # 30fps threshold
            }
        }


class PerformanceBenchmark:
    """Performance benchmarks and thresholds."""
    
    EXCELLENT_TTFF_MS = 300
    GOOD_TTFF_MS = 500
    POOR_TTFF_MS = 1000
    
    EXCELLENT_LATENCY_MS = 800
    GOOD_LATENCY_MS = 1500
    POOR_LATENCY_MS = 3000
    
    TARGET_CONNECTION_RATE = 0.98
    TARGET_UI_SCORE = 0.9
    
    @classmethod
    def grade_metrics(cls, metrics: PerformanceMetrics) -> Dict[str, str]:
        """Grade performance metrics."""
        grades = {}
        
        # TTFF grading
        if metrics.time_to_first_frame_ms:
            if metrics.time_to_first_frame_ms <= cls.EXCELLENT_TTFF_MS:
                grades['ttff'] = 'A'
            elif metrics.time_to_first_frame_ms <= cls.GOOD_TTFF_MS:
                grades['ttff'] = 'B'
            elif metrics.time_to_first_frame_ms <= cls.POOR_TTFF_MS:
                grades['ttff'] = 'C'
            else:
                grades['ttff'] = 'F'
        
        # Latency grading
        if metrics.avg_response_latency_ms:
            if metrics.avg_response_latency_ms <= cls.EXCELLENT_LATENCY_MS:
                grades['latency'] = 'A'
            elif metrics.avg_response_latency_ms <= cls.GOOD_LATENCY_MS:
                grades['latency'] = 'B'
            elif metrics.avg_response_latency_ms <= cls.POOR_LATENCY_MS:
                grades['latency'] = 'C'
            else:
                grades['latency'] = 'F'
        
        # Connection reliability
        if metrics.connection_success_rate >= cls.TARGET_CONNECTION_RATE:
            grades['connection'] = 'A'
        elif metrics.connection_success_rate >= 0.95:
            grades['connection'] = 'B'
        elif metrics.connection_success_rate >= 0.9:
            grades['connection'] = 'C'
        else:
            grades['connection'] = 'F'
        
        # UI responsiveness
        if metrics.ui_responsiveness_score >= cls.TARGET_UI_SCORE:
            grades['ui'] = 'A'
        elif metrics.ui_responsiveness_score >= 0.8:
            grades['ui'] = 'B'
        elif metrics.ui_responsiveness_score >= 0.7:
            grades['ui'] = 'C'
        else:
            grades['ui'] = 'F'
        
        return grades