// reactapp/src/components/TaskBoard.tsx
// =======================================
// Drag-and-drop Kanban board using @dnd-kit
//
// Key @dnd-kit concepts:
//   DndContext     — root context that tracks drag state
//   useSortable    — makes an item draggable within a sortable list
//   SortableContext — defines the ordered list of draggable items
//   DragOverlay    — renders a floating clone during drag (better perf than moving DOM)
//   arrayMove      — utility to reorder an array after a drag

import { useState } from "react";
import type { ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Clock, AlertCircle, CheckCircle } from "lucide-react";

// ── Domain types ──────────────────────────────────────────────────────────────

type TaskStatus = "pending" | "in_progress" | "done";

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee?: string;
  priority: "low" | "medium" | "high";
  createdAt: string;
}

// ── Sortable Task Card ─────────────────────────────────────────────────────────
// useSortable provides:
//   attributes  — aria roles for accessibility
//   listeners   — mouse/touch event handlers for drag initiation
//   setNodeRef  — ref to attach to the DOM element
//   transform   — current CSS transform during drag
//   transition  — smooth animation when releasing
//   isDragging  — true while this item is being dragged

interface TaskCardProps {
  task: Task;
  overlay?: boolean; // true when rendering inside DragOverlay
}

function TaskCard({ task, overlay = false }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Reduce opacity on the source item during drag
    opacity: isDragging && !overlay ? 0.4 : 1,
  };

  const priorityColors = {
    low: "#22c55e",
    medium: "#f59e0b",
    high: "#ef4444",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card ${overlay ? "task-card--overlay" : ""} priority-${task.priority}`}
    >
      {/* Drag handle — only the handle triggers drag, not the whole card */}
      <button
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>

      <div className="task-body">
        <div className="task-title-row">
          <span className="task-title">{task.title}</span>
          <span
            className="priority-dot"
            style={{ backgroundColor: priorityColors[task.priority] }}
            title={`Priority: ${task.priority}`}
          />
        </div>
        {task.description && <p className="task-desc">{task.description}</p>}
        {task.assignee && <span className="task-assignee">@{task.assignee}</span>}
      </div>
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

const COLUMN_CONFIG: Record<TaskStatus, { label: string; icon: ReactNode; color: string }> = {
  pending: { label: "Pending", icon: <Clock size={14} />, color: "#6b7280" },
  in_progress: { label: "In Progress", icon: <AlertCircle size={14} />, color: "#f59e0b" },
  done: { label: "Done", icon: <CheckCircle size={14} />, color: "#22c55e" },
};

interface ColumnProps {
  status: TaskStatus;
  tasks: Task[];
}

function Column({ status, tasks }: ColumnProps) {
  const config = COLUMN_CONFIG[status];

  return (
    <div className="kanban-column">
      <div className="column-header" style={{ borderTopColor: config.color }}>
        <span style={{ color: config.color }}>{config.icon}</span>
        <span className="column-title">{config.label}</span>
        <span className="column-count">{tasks.length}</span>
      </div>

      {/* SortableContext wraps the list — items must match the IDs of useSortable calls */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="column-body">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}

          {tasks.length === 0 && (
            <div className="column-empty">Drop tasks here</div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ── TaskBoard Page ────────────────────────────────────────────────────────────

const SEED_TASKS: Task[] = [
  { id: "1", title: "Set up gRPC server", description: "Add proto stubs and reflection", status: "done", assignee: "alice", priority: "high", createdAt: "2024-01-01" },
  { id: "2", title: "Write PyTorch MNIST example", description: "CNN with 2 conv layers", status: "done", priority: "medium", createdAt: "2024-01-02" },
  { id: "3", title: "Implement tRPC router", description: "User, realm, task sub-routers", status: "in_progress", assignee: "bob", priority: "high", createdAt: "2024-01-03" },
  { id: "4", title: "Add F# Railway module", description: "bind, map, sequence combinators", status: "in_progress", priority: "medium", createdAt: "2024-01-04" },
  { id: "5", title: "Docker Compose healthchecks", description: "All services with depends_on", status: "pending", priority: "low", createdAt: "2024-01-05" },
  { id: "6", title: "Terraform AWS networking module", description: "VPC, subnets, IGW", status: "pending", assignee: "alice", priority: "medium", createdAt: "2024-01-06" },
  { id: "7", title: "React drag-and-drop board", description: "Using @dnd-kit/sortable", status: "pending", priority: "high", createdAt: "2024-01-07" },
];

export default function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // PointerSensor — triggers drag after moving 8px (prevents accidental drags)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const tasksByStatus = (status: TaskStatus) =>
    tasks.filter((t) => t.status === status);

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);

    if (!over || active.id === over.id) return;

    setTasks((prev) => {
      const oldIndex = prev.findIndex((t) => t.id === active.id);
      const newIndex = prev.findIndex((t) => t.id === over.id);

      // If the target item has a different status, move the dragged item to that column
      const targetTask = prev[newIndex];
      if (targetTask && prev[oldIndex]?.status !== targetTask.status) {
        return prev.map((t) =>
          t.id === active.id ? { ...t, status: targetTask.status } : t
        );
      }

      // Same column — reorder using arrayMove
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const statuses: TaskStatus[] = ["pending", "in_progress", "done"];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Task Board</h1>
          <p className="page-subtitle">Drag cards to change status</p>
        </div>
        <button className="btn-primary">
          <Plus size={16} /> New Task
        </button>
      </div>

      {/* DndContext is the root that coordinates all drag interactions */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="kanban-board">
          {statuses.map((status) => (
            <Column key={status} status={status} tasks={tasksByStatus(status)} />
          ))}
        </div>

        {/* DragOverlay renders OUTSIDE the normal flow — always on top, no layout shift */}
        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
