import { Task } from '@/models/Task'
import { Story } from '@/models/Story'
import { Sprint } from '@/models/Sprint'
import { Epic } from '@/models/Epic'

export class CompletionService {
  /**
   * Check and update story completion based on its tasks
   */
  static async checkStoryCompletion(storyId: string): Promise<void> {
    try {
      const story = await Story.findById(storyId)
      if (!story) return

      // Get all non-archived tasks for this story
      // Only active tasks should count towards story completion
      const tasks = await Task.find({ 
        story: storyId,
        archived: { $ne: true } // Exclude archived tasks
      })
      
      if (tasks.length === 0) return

      // Check if all active tasks are completed (status = 'done')
      const allTasksCompleted = tasks.every(task => task.status === 'done')
      
      if (allTasksCompleted && story.status !== 'done') {
        await Story.findByIdAndUpdate(storyId, {
          status: 'done',
          completedAt: new Date()
        })
        
        // Check if sprint should be completed
        if (story.sprint) {
          await this.checkSprintCompletion(story.sprint.toString())
        }
        
        // Check if epic should be completed (based on stories, not sprints)
        if (story.epic) {
          await this.checkEpicCompletion(story.epic.toString())
        }
      }
    } catch (error) {
      console.error('Error checking story completion:', error)
    }
  }

  /**
   * Check and update sprint completion based on its stories
   */
  static async checkSprintCompletion(sprintId: string): Promise<void> {
    try {
      const sprint = await Sprint.findById(sprintId)
      if (!sprint) return

      // Get all stories for this sprint
      const stories = await Story.find({ sprint: sprintId })
      
      if (stories.length === 0) return

      // Check if all stories are done
      const allStoriesCompleted = stories.every(story => story.status === 'done')
      
      if (allStoriesCompleted && sprint.status !== 'completed') {
        await Sprint.findByIdAndUpdate(sprintId, {
          status: 'completed',
          actualEndDate: new Date()
        })
        
        // Check if epic should be completed
        const epicIds = Array.from(new Set(stories.map(story => story.epic).filter(Boolean)))
        for (const epicId of epicIds) {
          if (epicId) {
            await this.checkEpicCompletion(epicId.toString())
          }
        }
      }
    } catch (error) {
      console.error('Error checking sprint completion:', error)
    }
  }

  /**
   * Check and update epic completion based on its stories and tasks
   * Epic is done when:
   * 1. All user stories in the epic have status 'done'
   * 2. AND all tasks (both direct and via stories) have status 'done'
   */
  static async checkEpicCompletion(epicId: string): Promise<void> {
    try {
      const epic = await Epic.findById(epicId)
      if (!epic) return

      // Get all stories for this epic
      const stories = await Story.find({ epic: epicId })
      
      // Check if all stories are done (status = 'done')
      const allStoriesCompleted = stories.length > 0 
        ? stories.every(story => story.status === 'done')
        : true // If no stories, consider this condition met

      // Get all non-archived tasks that belong to stories in this epic
      const storyIds = stories.map(story => story._id)
      const tasksInStories = storyIds.length > 0
        ? await Task.find({ 
            story: { $in: storyIds },
            archived: { $ne: true }
          })
        : []

      // Get all non-archived tasks directly linked to this epic
      const directTasks = await Task.find({
        epic: epicId,
        archived: { $ne: true }
      })

      // Combine all tasks (from stories and direct)
      const allTasks = [...tasksInStories, ...directTasks]

      // Check if all active tasks are completed (status = 'done')
      const allTasksCompleted = allTasks.length > 0
        ? allTasks.every(task => task.status === 'done')
        : true // If no tasks, consider this condition met

      // Epic is done only when BOTH conditions are met:
      // 1. All stories are done
      // 2. All tasks (direct + via stories) are done
      if (allStoriesCompleted && allTasksCompleted && epic.status !== 'done') {
        await Epic.findByIdAndUpdate(epicId, {
          status: 'done',
          completedAt: new Date()
        })
      }
    } catch (error) {
      console.error('Error checking epic completion:', error)
    }
  }

  /**
   * Update epic status to in_progress when a task with that epic is added to sprint
   */
  static async updateEpicStatusOnTaskAddedToSprint(taskId: string): Promise<void> {
    try {
      const task = await Task.findById(taskId).populate('epic', '_id status')
      if (!task || !task.epic) return

      const epicId = typeof task.epic === 'object' && task.epic !== null && '_id' in task.epic
        ? task.epic._id.toString()
        : task.epic.toString()

      const epic = await Epic.findById(epicId)
      if (!epic) return

      // Set epic to in_progress when any task is added to sprint
      if (epic.status !== 'in_progress' && epic.status !== 'done') {
        await Epic.findByIdAndUpdate(epicId, {
          status: 'in_progress'
        })
      }
    } catch (error) {
      console.error('Error updating epic status on task added to sprint:', error)
    }
  }

  /**
   * Main method to check completion when a task status changes
   */
  static async handleTaskStatusChange(taskId: string): Promise<void> {
    try {
      const task = await Task.findById(taskId).populate('story', 'epic').populate('epic', '_id')
      if (!task) return

      // If task is completed, check story completion
      if (task.status === 'done' && task.story) {
        await this.checkStoryCompletion(task.story.toString())
        
        // Also check epic completion if the story belongs to an epic
        // This ensures epic completion is checked when tasks change status
        if (typeof task.story === 'object' && task.story !== null && 'epic' in task.story && task.story.epic) {
          const epicId = typeof task.story.epic === 'object' && task.story.epic !== null && '_id' in task.story.epic
            ? task.story.epic._id.toString()
            : task.story.epic.toString()
          await this.checkEpicCompletion(epicId)
        }
      }

      // If task has direct epic link and is completed, check epic completion
      if (task.status === 'done' && task.epic) {
        const epicId = typeof task.epic === 'object' && task.epic !== null && '_id' in task.epic
          ? task.epic._id.toString()
          : task.epic.toString()
        await this.checkEpicCompletion(epicId)
      }
    } catch (error) {
      console.error('Error handling task status change:', error)
    }
  }

  /**
   * Check completion for a specific project
   */
  static async checkProjectCompletion(projectId: string): Promise<void> {
    try {
      // Get all stories for this project
      const stories = await Story.find({ project: projectId })
      
      for (const story of stories) {
        if (story.sprint) {
          await this.checkSprintCompletion(story.sprint.toString())
        }
        
        if (story.epic) {
          await this.checkEpicCompletion(story.epic.toString())
        }
      }
    } catch (error) {
      console.error('Error checking project completion:', error)
    }
  }
}
