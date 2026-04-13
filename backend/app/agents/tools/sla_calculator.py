from datetime import datetime, timedelta

def calculate_sla_deadline(priority: str) -> str:
    """
    Calculate SLA deadline based on priority.
    critical: 1 hour
    high: 4 hours
    medium: 24 hours
    low: 72 hours
    """
    now = datetime.utcnow()
    
    delays = {
        "critical": 1,
        "high": 4,
        "medium": 24,
        "low": 72
    }
    
    delay_hours = delays.get(priority, 24)
    deadline = now + timedelta(hours=delay_hours)
    
    return deadline.isoformat()
