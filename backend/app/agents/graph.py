from langgraph.graph import StateGraph, END
from app.agents.state import TicketAgentState
from app.agents.nodes.triage import triage_node
from app.agents.nodes.router import router_node
from app.agents.nodes.resolver import resolver_node
from app.agents.nodes.escalation import escalation_node
from app.agents.nodes.feedback import feedback_node
from app.agents.edges import route_decision

def build_ticket_pipeline() -> StateGraph:
    """Builds and compiles the StateGraph for ticket processing."""
    
    # 1. Initialize StateGraph
    builder = StateGraph(TicketAgentState)
    
    # 2. Add Nodes
    builder.add_node("triage", triage_node)
    builder.add_node("router", router_node)
    builder.add_node("resolver", resolver_node)
    builder.add_node("escalation", escalation_node)
    builder.add_node("feedback", feedback_node)
    
    # 3. Add Edges
    builder.set_entry_point("triage")
    builder.add_edge("triage", "router")
    
    # Conditional routing
    builder.add_conditional_edges(
        "router",
        route_decision,
        {
            "resolver": "resolver",
            "escalation": "escalation"
        }
    )
    
    # Both paths lead to feedback then END
    builder.add_edge("resolver", "feedback")
    builder.add_edge("escalation", "feedback")
    builder.add_edge("feedback", END)
    
    # 4. Compile
    return builder.compile()

# Singleton graph instance
ticket_pipeline = build_ticket_pipeline()
