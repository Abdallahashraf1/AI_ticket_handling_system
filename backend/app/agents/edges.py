from app.agents.state import TicketAgentState

def route_decision(state: TicketAgentState) -> str:
    """
    Decides the next node after the router node.
    It routes to 'resolver' if 'auto_resolve', else 'escalation'.
    """
    decision = state.get("routing_decision", "escalate")
    if decision == "auto_resolve":
        return "resolver"
    return "escalation"
