from flask import Blueprint, render_template

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.get("/")
def overview():
    return render_template("dashboard.html", active="dashboard", title="Overview")


@dashboard_bp.get("/security")
def security():
    return render_template("security.html", active="security", title="Security Monitor")


@dashboard_bp.get("/robot")
def robot():
    return render_template("robot.html", active="robot", title="Robot and Tour")


@dashboard_bp.get("/checkpoints")
def checkpoints():
    return render_template("checkpoints.html", active="checkpoints", title="Checkpoints")


@dashboard_bp.get("/items")
def items():
    return render_template("items.html", active="items", title="Historical Items")
