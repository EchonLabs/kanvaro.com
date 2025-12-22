---
slug: "concepts/project-management-features"
title: "Project Management Features"
summary: "Detailed overview of project management capabilities including agile methodologies, task tracking, and team collaboration."
visibility: "public"
audiences: ["admin", "project_manager", "team_member", "client", "viewer"]
category: "concepts"
order: 30
updated: "2025-01-04"
---

# Kanvaro - Advanced Project Management Features

## Overview

Kanvaro implements comprehensive project management with backlogs, sprints, epics, stories, tasks, and subtasks. The system supports multiple views (Kanban, List, Calendar), advanced filtering, and detailed project analytics with burndown charts and velocity tracking.

## Project Entity Structure

### Project Model
```typescript
// models/Project.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
  name: string;
  description: string;
  status: 'planning' | 'active' | 'on-hold' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  startDate?: Date;
  endDate?: Date;
  actualStartDate?: Date;
  actualEndDate?: Date;
  budget?: number;
  actualCost?: number;
  currency: string;
  owner: mongoose.Types.ObjectId; // Project Manager
  organization: mongoose.Types.ObjectId;
  teamMembers: mongoose.Types.ObjectId[];
  clients: mongoose.Types.ObjectId[];
  tags: string[];
  customFields: Record<string, any>;
  settings: {
    allowTimeTracking: boolean;
    allowManualTimeLogs: boolean;
    requireTimeApproval: boolean;
    allowClientAccess: boolean;
    clientCanComment: boolean;
    clientCanUpload: boolean;
  };
  progress: {
    completionPercentage: number;
    tasksCompleted: number;
    totalTasks: number;
    hoursLogged: number;
    estimatedHours: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['planning', 'active', 'on-hold', 'completed', 'cancelled'],
    default: 'planning'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  startDate: Date,
  endDate: Date,
  actualStartDate: Date,
  actualEndDate: Date,
  budget: {
    type: Number,
    min: 0
  },
  actualCost: {
    type: Number,
    min: 0,
    default: 0
  },
  currency: {
    type: String,
    default: 'USD',
    maxlength: 3
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  teamMembers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  clients: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  customFields: {
    type: Map,
    of: Schema.Types.Mixed
  },
  settings: {
    allowTimeTracking: { type: Boolean, default: true },
    allowManualTimeLogs: { type: Boolean, default: true },
    requireTimeApproval: { type: Boolean, default: false },
    allowClientAccess: { type: Boolean, default: false },
    clientCanComment: { type: Boolean, default: false },
    clientCanUpload: { type: Boolean, default: false }
  },
  progress: {
    completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
    tasksCompleted: { type: Number, default: 0, min: 0 },
    totalTasks: { type: Number, default: 0, min: 0 },
    hoursLogged: { type: Number, default: 0, min: 0 },
    estimatedHours: { type: Number, default: 0, min: 0 }
  }
}, {
  timestamps: true
});

// Indexes
ProjectSchema.index({ organization: 1 });
ProjectSchema.index({ owner: 1 });
ProjectSchema.index({ status: 1 });
ProjectSchema.index({ priority: 1 });
ProjectSchema.index({ teamMembers: 1 });
ProjectSchema.index({ clients: 1 });
ProjectSchema.index({ tags: 1 });
ProjectSchema.index({ createdAt: -1 });
ProjectSchema.index({ organization: 1, status: 1 });
ProjectSchema.index({ organization: 1, owner: 1 });

export const Project = mongoose.model<IProject>('Project', ProjectSchema);
```

## backlog Management

### Epic Model
```typescript
// models/Epic.ts
export interface IEpic extends Document {
  title: string;
  description: string;
  project: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId;
  status: 'backlog' | 'in-progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  storyPoints?: number;
  estimatedHours?: number;
  actualHours?: number;
  startDate?: Date;
  dueDate?: Date;
  completedAt?: Date;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const EpicSchema = new Schema<IEpic>({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 2000
  },
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['backlog', 'in-progress', 'completed', 'cancelled'],
    default: 'backlog'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  storyPoints: {
    type: Number,
    min: 0
  },
  estimatedHours: {
    type: Number,
    min: 0
  },
  actualHours: {
    type: Number,
    min: 0,
    default: 0
  },
  startDate: Date,
  dueDate: Date,
  completedAt: Date,
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }]
}, {
  timestamps: true
});

EpicSchema.index({ project: 1 });
EpicSchema.index({ createdBy: 1 });
EpicSchema.index({ assignedTo: 1 });
EpicSchema.index({ status: 1 });
EpicSchema.index({ priority: 1 });
EpicSchema.index({ project: 1, status: 1 });

export const Epic = mongoose.model<IEpic>('Epic', EpicSchema);
```

### Story Model
```typescript
// models/Story.ts
export interface IStory extends Document {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  project: mongoose.Types.ObjectId;
  epic?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId;
  status: 'backlog' | 'in-progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  storyPoints?: number;
  estimatedHours?: number;
  actualHours?: number;
  sprint?: mongoose.Types.ObjectId;
  startDate?: Date;
  dueDate?: Date;
  completedAt?: Date;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const StorySchema = new Schema<IStory>({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 2000
  },
  acceptanceCriteria: [{
    type: String,
    trim: true,
    maxlength: 500
  }],
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  epic: {
    type: Schema.Types.ObjectId,
    ref: 'Epic'
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['backlog', 'in-progress', 'completed', 'cancelled'],
    default: 'backlog'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  storyPoints: {
    type: Number,
    min: 0
  },
  estimatedHours: {
    type: Number,
    min: 0
  },
  actualHours: {
    type: Number,
    min: 0,
    default: 0
  },
  sprint: {
    type: Schema.Types.ObjectId,
    ref: 'Sprint'
  },
  startDate: Date,
  dueDate: Date,
  completedAt: Date,
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }]
}, {
  timestamps: true
});

StorySchema.index({ project: 1 });
StorySchema.index({ epic: 1 });
StorySchema.index({ createdBy: 1 });
StorySchema.index({ assignedTo: 1 });
StorySchema.index({ sprint: 1 });
StorySchema.index({ status: 1 });
StorySchema.index({ priority: 1 });
StorySchema.index({ project: 1, status: 1 });
StorySchema.index({ sprint: 1, status: 1 });

export const Story = mongoose.model<IStory>('Story', StorySchema);
```

### Task Model
```typescript
// models/Task.ts
export interface ITask extends Document {
  title: string;
  description: string;
  project: mongoose.Types.ObjectId;
  story?: mongoose.Types.ObjectId;
  parentTask?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId;
  status: 'todo' | 'in-progress' | 'review' | 'testing' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask';
  storyPoints?: number;
  estimatedHours?: number;
  actualHours?: number;
  sprint?: mongoose.Types.ObjectId;
  startDate?: Date;
  dueDate?: Date;
  completedAt?: Date;
  labels: string[];
  attachments: Array<{
    name: string;
    url: string;
    size: number;
    type: string;
    uploadedBy: mongoose.Types.ObjectId;
    uploadedAt: Date;
  }>;
  comments: Array<{
    content: string;
    author: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 2000
  },
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  story: {
    type: Schema.Types.ObjectId,
    ref: 'Story'
  },
  parentTask: {
    type: Schema.Types.ObjectId,
    ref: 'Task'
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['todo', 'in-progress', 'review', 'testing', 'completed', 'cancelled'],
    default: 'todo'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  type: {
    type: String,
    enum: ['bug', 'feature', 'improvement', 'task', 'subtask'],
    default: 'task'
  },
  storyPoints: {
    type: Number,
    min: 0
  },
  estimatedHours: {
    type: Number,
    min: 0
  },
  actualHours: {
    type: Number,
    min: 0,
    default: 0
  },
  sprint: {
    type: Schema.Types.ObjectId,
    ref: 'Sprint'
  },
  startDate: Date,
  dueDate: Date,
  completedAt: Date,
  labels: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  attachments: [{
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    type: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
  comments: [{
    content: { type: String, required: true, maxlength: 1000 },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

TaskSchema.index({ project: 1 });
TaskSchema.index({ story: 1 });
TaskSchema.index({ parentTask: 1 });
TaskSchema.index({ createdBy: 1 });
TaskSchema.index({ assignedTo: 1 });
TaskSchema.index({ sprint: 1 });
TaskSchema.index({ status: 1 });
TaskSchema.index({ priority: 1 });
TaskSchema.index({ type: 1 });
TaskSchema.index({ project: 1, status: 1 });
TaskSchema.index({ sprint: 1, status: 1 });
TaskSchema.index({ assignedTo: 1, status: 1 });

export const Task = mongoose.model<ITask>('Task', TaskSchema);
```

## Sprint Management

### Sprint Model
```typescript
// models/Sprint.ts
export interface ISprint extends Document {
  name: string;
  description?: string;
  project: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  status: 'planning' | 'active' | 'completed' | 'cancelled';
  startDate: Date;
  endDate: Date;
  actualStartDate?: Date;
  actualEndDate?: Date;
  goal?: string;
  velocity?: number;
  capacity: number; // Total team capacity in hours
  stories: mongoose.Types.ObjectId[];
  tasks: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const SprintSchema = new Schema<ISprint>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['planning', 'active', 'completed', 'cancelled'],
    default: 'planning'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  actualStartDate: Date,
  actualEndDate: Date,
  goal: {
    type: String,
    maxlength: 500
  },
  velocity: {
    type: Number,
    min: 0
  },
  capacity: {
    type: Number,
    required: true,
    min: 0
  },
  stories: [{
    type: Schema.Types.ObjectId,
    ref: 'Story'
  }],
  tasks: [{
    type: Schema.Types.ObjectId,
    ref: 'Task'
  }]
}, {
  timestamps: true
});

SprintSchema.index({ project: 1 });
SprintSchema.index({ createdBy: 1 });
SprintSchema.index({ status: 1 });
SprintSchema.index({ startDate: 1 });
SprintSchema.index({ endDate: 1 });
SprintSchema.index({ project: 1, status: 1 });

export const Sprint = mongoose.model<ISprint>('Sprint', SprintSchema);
```

## Project Views

### Kanban Board Implementation
```typescript
// components/projects/KanbanBoard.tsx
'use client';

import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Plus, MoreHorizontal } from 'lucide-react';

interface KanbanBoardProps {
  projectId: string;
  tasks: Task[];
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void;
  onTaskMove: (taskId: string, newStatus: string, newIndex: number) => void;
}

const STATUS_COLUMNS = [
  { id: 'todo', title: 'To Do', color: 'bg-gray-100' },
  { id: 'in-progress', title: 'In Progress', color: 'bg-blue-100' },
  { id: 'review', title: 'Review', color: 'bg-yellow-100' },
  { id: 'testing', title: 'Testing', color: 'bg-purple-100' },
  { id: 'completed', title: 'Completed', color: 'bg-green-100' }
];

export function KanbanBoard({ projectId, tasks, onTaskUpdate, onTaskMove }: KanbanBoardProps) {
  const [columns, setColumns] = useState<Record<string, Task[]>>({});

  useEffect(() => {
    // Group tasks by status
    const groupedTasks = tasks.reduce((acc, task) => {
      if (!acc[task.status]) {
        acc[task.status] = [];
      }
      acc[task.status].push(task);
      return acc;
    }, {} as Record<string, Task[]>);

    setColumns(groupedTasks);
  }, [tasks]);

  const handleDragEnd = (result: any) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const newColumns = { ...columns };
    const sourceColumn = newColumns[source.droppableId];
    const destColumn = newColumns[destination.droppableId];

    if (source.droppableId === destination.droppableId) {
      // Moving within the same column
      const newTasks = Array.from(sourceColumn);
      const [removed] = newTasks.splice(source.index, 1);
      newTasks.splice(destination.index, 0, removed);
      newColumns[source.droppableId] = newTasks;
    } else {
      // Moving between columns
      const sourceTasks = Array.from(sourceColumn);
      const destTasks = Array.from(destColumn);
      const [removed] = sourceTasks.splice(source.index, 1);
      
      // Update task status
      removed.status = destination.droppableId;
      destTasks.splice(destination.index, 0, removed);
      
      newColumns[source.droppableId] = sourceTasks;
      newColumns[destination.droppableId] = destTasks;

      // Call API to update task
      onTaskMove(draggableId, destination.droppableId, destination.index);
    }

    setColumns(newColumns);
  };

  return (
    <div className="flex h-full space-x-4 overflow-x-auto">
      <DragDropContext onDragEnd={handleDragEnd}>
        {STATUS_COLUMNS.map((column) => (
          <div key={column.id} className="flex-shrink-0 w-80">
            <div className={`rounded-lg p-4 ${column.color}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm">{column.title}</h3>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">
                    {columns[column.id]?.length || 0}
                  </span>
                  <Button size="sm" variant="ghost">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`min-h-96 space-y-2 ${
                      snapshot.isDraggingOver ? 'bg-blue-50' : ''
                    }`}
                  >
                    {columns[column.id]?.map((task, index) => (
                      <Draggable
                        key={task._id}
                        draggableId={task._id}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`bg-white rounded-lg p-3 shadow-sm border ${
                              snapshot.isDragging ? 'shadow-lg' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <h4 className="font-medium text-sm">{task.title}</h4>
                              <Button size="sm" variant="ghost">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </div>
                            
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="secondary" className="text-xs">
                                {task.priority}
                              </Badge>
                              {task.storyPoints && (
                                <span className="text-xs text-gray-500">
                                  {task.storyPoints} pts
                                </span>
                              )}
                            </div>
                            
                            {task.assignedTo && (
                              <div className="flex items-center space-x-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={task.assignedTo.avatar} />
                                  <AvatarFallback>
                                    {task.assignedTo.firstName.charAt(0)}
                                    {task.assignedTo.lastName.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-gray-500">
                                  {task.assignedTo.firstName} {task.assignedTo.lastName}
                                </span>
                              </div>
                            )}
                            
                            {task.labels.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {task.labels.map((label, index) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {label}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          </div>
        ))}
      </DragDropContext>
    </div>
  );
}
```

### List View Implementation
```typescript
// components/projects/ListView.tsx
'use client';

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, SortAsc, SortDesc } from 'lucide-react';

interface ListViewProps {
  projectId: string;
  tasks: Task[];
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void;
}

export function ListView({ projectId, tasks, onTaskUpdate }: ListViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filter and sort tasks
  const filteredTasks = tasks
    .filter(task => {
      if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (statusFilter !== 'all' && task.status !== statusFilter) {
        return false;
      }
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
        return false;
      }
      if (assigneeFilter !== 'all' && task.assignedTo?._id !== assigneeFilter) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      let aValue = a[sortBy as keyof Task];
      let bValue = b[sortBy as keyof Task];
      
      if (sortBy === 'assignedTo') {
        aValue = a.assignedTo?.firstName || '';
        bValue = b.assignedTo?.firstName || '';
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOrder === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="todo">To Do</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="review">Review</SelectItem>
            <SelectItem value="testing">Testing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('title')}
                  className="h-8 px-2"
                >
                  Title
                  {sortBy === 'title' && (
                    sortOrder === 'asc' ? <SortAsc className="ml-2 h-4 w-4" /> : <SortDesc className="ml-2 h-4 w-4" />
                  )}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('status')}
                  className="h-8 px-2"
                >
                  Status
                  {sortBy === 'status' && (
                    sortOrder === 'asc' ? <SortAsc className="ml-2 h-4 w-4" /> : <SortDesc className="ml-2 h-4 w-4" />
                  )}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('priority')}
                  className="h-8 px-2"
                >
                  Priority
                  {sortBy === 'priority' && (
                    sortOrder === 'asc' ? <SortAsc className="ml-2 h-4 w-4" /> : <SortDesc className="ml-2 h-4 w-4" />
                  )}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('assignedTo')}
                  className="h-8 px-2"
                >
                  Assignee
                  {sortBy === 'assignedTo' && (
                    sortOrder === 'asc' ? <SortAsc className="ml-2 h-4 w-4" /> : <SortDesc className="ml-2 h-4 w-4" />
                  )}
                </Button>
              </TableHead>
              <TableHead>Story Points</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTasks.map((task) => (
              <TableRow key={task._id}>
                <TableCell className="font-medium">{task.title}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{task.status}</Badge>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={task.priority === 'critical' ? 'destructive' : 'outline'}
                  >
                    {task.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  {task.assignedTo ? (
                    <div className="flex items-center space-x-2">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {task.assignedTo.firstName.charAt(0)}
                          {task.assignedTo.lastName.charAt(0)}
                        </span>
                      </div>
                      <span className="text-sm">
                        {task.assignedTo.firstName} {task.assignedTo.lastName}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell>
                  {task.storyPoints ? `${task.storyPoints} pts` : '-'}
                </TableCell>
                <TableCell>
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-'}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm">
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

## Sprint Planning

### Sprint Planning Service
```typescript
// lib/services/sprint-planning-service.ts
import { Sprint } from '@/models/Sprint';
import { Story } from '@/models/Story';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';

export class SprintPlanningService {
  // Create new sprint
  static async createSprint(
    name: string,
    description: string,
    projectId: string,
    startDate: Date,
    endDate: Date,
    goal: string,
    capacity: number,
    createdBy: string
  ): Promise<ISprint> {
    const sprint = new Sprint({
      name,
      description,
      project: projectId,
      createdBy,
      startDate,
      endDate,
      goal,
      capacity
    });

    await sprint.save();
    return sprint;
  }

  // Add stories to sprint
  static async addStoriesToSprint(
    sprintId: string,
    storyIds: string[]
  ): Promise<ISprint> {
    const sprint = await Sprint.findById(sprintId);
    if (!sprint) {
      throw new Error('Sprint not found');
    }

    // Validate stories belong to the same project
    const stories = await Story.find({
      _id: { $in: storyIds },
      project: sprint.project
    });

    if (stories.length !== storyIds.length) {
      throw new Error('Some stories do not belong to this project');
    }

    // Add stories to sprint
    sprint.stories.push(...storyIds);
    await sprint.save();

    // Update story sprint assignment
    await Story.updateMany(
      { _id: { $in: storyIds } },
      { sprint: sprintId, status: 'in-progress' }
    );

    return sprint;
  }

  // Remove stories from sprint
  static async removeStoriesFromSprint(
    sprintId: string,
    storyIds: string[]
  ): Promise<ISprint> {
    const sprint = await Sprint.findById(sprintId);
    if (!sprint) {
      throw new Error('Sprint not found');
    }

    // Remove stories from sprint
    sprint.stories = sprint.stories.filter(
      storyId => !storyIds.includes(storyId.toString())
    );
    await sprint.save();

    // Update story sprint assignment
    await Story.updateMany(
      { _id: { $in: storyIds } },
      { sprint: null, status: 'backlog' }
    );

    return sprint;
  }

  // Calculate sprint velocity
  static async calculateSprintVelocity(
    projectId: string,
    numberOfSprints: number = 5
  ): Promise<number> {
    const completedSprints = await Sprint.find({
      project: projectId,
      status: 'completed'
    })
    .sort({ endDate: -1 })
    .limit(numberOfSprints);

    if (completedSprints.length === 0) {
      return 0;
    }

    const totalStoryPoints = completedSprints.reduce((sum, sprint) => {
      return sum + (sprint.velocity || 0);
    }, 0);

    return Math.round(totalStoryPoints / completedSprints.length);
  }

  // Get sprint capacity
  static async getSprintCapacity(
    sprintId: string
  ): Promise<{
    totalCapacity: number;
    usedCapacity: number;
    remainingCapacity: number;
    teamMembers: Array<{
      user: any;
      capacity: number;
      used: number;
      remaining: number;
    }>;
  }> {
    const sprint = await Sprint.findById(sprintId)
      .populate('project')
      .populate('stories');

    if (!sprint) {
      throw new Error('Sprint not found');
    }

    const project = await Project.findById(sprint.project)
      .populate('teamMembers');

    const teamMembers = project.teamMembers;
    const totalCapacity = sprint.capacity;
    
    // Calculate used capacity from time logs
    const usedCapacity = await this.calculateUsedCapacity(sprintId);
    const remainingCapacity = totalCapacity - usedCapacity;

    const teamCapacity = teamMembers.map(member => ({
      user: member,
      capacity: Math.round(totalCapacity / teamMembers.length),
      used: Math.round(usedCapacity / teamMembers.length),
      remaining: Math.round(remainingCapacity / teamMembers.length)
    }));

    return {
      totalCapacity,
      usedCapacity,
      remainingCapacity,
      teamMembers: teamCapacity
    };
  }

  private static async calculateUsedCapacity(sprintId: string): Promise<number> {
    // Implementation to calculate used capacity from time logs
    // This would query the time tracking system
    return 0;
  }
}
```

## Reports and Analytics

### Burndown Chart Service
```typescript
// lib/services/burndown-service.ts
import { Sprint } from '@/models/Sprint';
import { Story } from '@/models/Story';
import { Task } from '@/models/Task';

export class BurndownService {
  // Generate burndown chart data
  static async generateBurndownData(
    sprintId: string
  ): Promise<{
    ideal: Array<{ date: string; points: number }>;
    actual: Array<{ date: string; points: number }>;
    remaining: number;
    total: number;
  }> {
    const sprint = await Sprint.findById(sprintId)
      .populate('stories');

    if (!sprint) {
      throw new Error('Sprint not found');
    }

    const totalStoryPoints = sprint.stories.reduce((sum, story) => {
      return sum + (story.storyPoints || 0);
    }, 0);

    const sprintDays = this.getSprintDays(sprint.startDate, sprint.endDate);
    const idealBurndown = this.calculateIdealBurndown(totalStoryPoints, sprintDays);
    const actualBurndown = await this.calculateActualBurndown(sprintId, sprintDays);

    return {
      ideal: idealBurndown,
      actual: actualBurndown,
      remaining: actualBurndown[actualBurndown.length - 1]?.points || 0,
      total: totalStoryPoints
    };
  }

  private static getSprintDays(startDate: Date, endDate: Date): string[] {
    const days = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      // Skip weekends
      if (current.getDay() !== 0 && current.getDay() !== 6) {
        days.push(current.toISOString().split('T')[0]);
      }
      current.setDate(current.getDate() + 1);
    }
    
    return days;
  }

  private static calculateIdealBurndown(
    totalPoints: number,
    days: string[]
  ): Array<{ date: string; points: number }> {
    const dailyBurn = totalPoints / days.length;
    
    return days.map((date, index) => ({
      date,
      points: Math.max(0, totalPoints - (dailyBurn * (index + 1)))
    }));
  }

  private static async calculateActualBurndown(
    sprintId: string,
    days: string[]
  ): Promise<Array<{ date: string; points: number }>> {
    // Implementation to calculate actual burndown from completed stories
    // This would query completed stories and their completion dates
    return days.map(date => ({ date, points: 0 }));
  }
}
```

---

*This project management features documentation will be updated as new project management capabilities are added and agile methodologies evolve.*
