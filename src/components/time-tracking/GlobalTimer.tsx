'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { 
  Play, 
  Pause, 
  Square, 
  Clock,
  Timer,
  CheckCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface TimerData {
  id: string
  taskId: string
  taskTitle: string
  projectName: string
  startTime: string
  duration: number
  isRunning: boolean
  isPaused: boolean
}

interface GlobalTimerProps {
  className?: string
}

export function GlobalTimer({ className }: GlobalTimerProps) {
  const [timer, setTimer] = useState<TimerData | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    loadCurrentTimer()
  }, [])

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (timer?.isRunning && !timer?.isPaused) {
      interval = setInterval(() => {
        setElapsed(prev => prev + 1)
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [timer?.isRunning, timer?.isPaused])

  const loadCurrentTimer = async () => {
    try {
      const response = await fetch('/api/time-tracking/timers')
      if (response.ok) {
        const data = await response.json()
        if (data.timer) {
          setTimer(data.timer)
          setElapsed(data.elapsed || 0)
        }
      }
    } catch (error) {
      console.error('Failed to load timer:', error)
    }
  }

  const startTimer = async (taskId: string) => {
    try {
      setLoading(true)
      const response = await fetch('/api/time-tracking/timers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', taskId })
      })

      if (response.ok) {
        const data = await response.json()
        setTimer(data.timer)
        setElapsed(0)
      }
    } catch (error) {
      console.error('Failed to start timer:', error)
    } finally {
      setLoading(false)
    }
  }

  const pauseTimer = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/time-tracking/timers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' })
      })

      if (response.ok) {
        const data = await response.json()
        setTimer(data.timer)
      }
    } catch (error) {
      console.error('Failed to pause timer:', error)
    } finally {
      setLoading(false)
    }
  }

  const resumeTimer = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/time-tracking/timers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' })
      })

      if (response.ok) {
        const data = await response.json()
        setTimer(data.timer)
      }
    } catch (error) {
      console.error('Failed to resume timer:', error)
    } finally {
      setLoading(false)
    }
  }

  const stopTimer = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/time-tracking/timers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      })

      if (response.ok) {
        setTimer(null)
        setElapsed(0)
      }
    } catch (error) {
      console.error('Failed to stop timer:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (!timer) {
    return (
      <Card className={cn('w-full max-w-sm', className)}>
        <CardContent className="p-4">
          <div className="flex items-center justify-center space-x-2">
            <Timer className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">No active timer</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn('w-full max-w-sm', className)}>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Timer Info */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate">
                {timer.taskTitle}
              </span>
              <Badge variant="outline" className="text-xs">
                {timer.projectName}
              </Badge>
            </div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Started {new Date(timer.startTime).toLocaleTimeString()}</span>
            </div>
          </div>

          {/* Timer Display */}
          <div className="text-center">
            <div className="text-2xl font-mono font-bold">
              {formatTime(elapsed)}
            </div>
            <div className="text-xs text-muted-foreground">
              {timer.isPaused ? 'Paused' : 'Running'}
            </div>
          </div>

          {/* Timer Controls */}
          <div className="flex items-center justify-center space-x-2">
            {timer.isRunning ? (
              timer.isPaused ? (
                <Button
                  size="sm"
                  onClick={resumeTimer}
                  disabled={loading}
                  className="flex items-center space-x-1"
                >
                  <Play className="h-3 w-3" />
                  <span>Resume</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={pauseTimer}
                  disabled={loading}
                  className="flex items-center space-x-1"
                >
                  <Pause className="h-3 w-3" />
                  <span>Pause</span>
                </Button>
              )
            ) : (
              <Button
                size="sm"
                onClick={() => startTimer(timer.taskId)}
                disabled={loading}
                className="flex items-center space-x-1"
              >
                <Play className="h-3 w-3" />
                <span>Start</span>
              </Button>
            )}

            <Button
              size="sm"
              variant="destructive"
              onClick={stopTimer}
              disabled={loading}
              className="flex items-center space-x-1"
            >
              <Square className="h-3 w-3" />
              <span>Stop</span>
            </Button>
          </div>

          {/* Task Link */}
          <div className="text-center">
            <Button
              variant="link"
              size="sm"
              onClick={() => router.push(`/tasks/${timer.taskId}`)}
              className="text-xs"
            >
              View Task
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
