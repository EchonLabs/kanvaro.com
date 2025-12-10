'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Area,
  AreaChart
} from 'recharts'
import { TrendingUp, TrendingDown, BarChart3, Activity } from 'lucide-react'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'

interface BurnRateData {
  date: string
  plannedBurn: number
  actualBurn: number
  velocity: number
  capacity: number
  utilization: number
  budgetRemaining: number
}

interface BurnRateChartProps {
  data: BurnRateData[]
  title?: string
  description?: string
}

export function BurnRateChart({ data, title = "Burn Rate Analysis", description }: BurnRateChartProps) {
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area'>('line')
  const [showVelocity, setShowVelocity] = useState(true)
  const [showUtilization, setShowUtilization] = useState(false)
  const { formatCurrency } = useOrgCurrency()
  const formatBudget = (value: number) =>
    formatCurrency(value, undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    })
  }

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="font-medium">{formatDate(label)}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.name.includes('Burn') ? formatBudget(entry.value) : 
                           entry.name.includes('Utilization') ? formatPercentage(entry.value) :
                           entry.value}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  const renderChart = () => {
    const commonProps = {
      data: data,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    }

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              yAxisId="burn"
              orientation="left"
              tickFormatter={formatBudget}
              tick={{ fontSize: 12 }}
            />
            {showUtilization && (
              <YAxis 
                yAxisId="utilization"
                orientation="right"
                tickFormatter={formatPercentage}
                tick={{ fontSize: 12 }}
              />
            )}
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line 
              yAxisId="burn"
              type="monotone" 
              dataKey="plannedBurn" 
              stroke="#8884d8" 
              strokeWidth={2}
              name="Planned Burn"
              dot={{ r: 4 }}
            />
            <Line 
              yAxisId="burn"
              type="monotone" 
              dataKey="actualBurn" 
              stroke="#82ca9d" 
              strokeWidth={2}
              name="Actual Burn"
              dot={{ r: 4 }}
            />
            {showVelocity && (
              <Line 
                yAxisId="burn"
                type="monotone" 
                dataKey="velocity" 
                stroke="#ffc658" 
                strokeWidth={2}
                name="Velocity (points)"
                dot={{ r: 4 }}
              />
            )}
            {showUtilization && (
              <Line 
                yAxisId="utilization"
                type="monotone" 
                dataKey="utilization" 
                stroke="#ff7300" 
                strokeWidth={2}
                name="Utilization"
                dot={{ r: 4 }}
              />
            )}
          </LineChart>
        )
      
      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              tickFormatter={formatBudget}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="plannedBurn" fill="#8884d8" name="Planned Burn" />
            <Bar dataKey="actualBurn" fill="#82ca9d" name="Actual Burn" />
            {showVelocity && (
              <Bar dataKey="velocity" fill="#ffc658" name="Velocity" />
            )}
          </BarChart>
        )
      
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              tickFormatter={formatBudget}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="plannedBurn" 
              stackId="1"
              stroke="#8884d8" 
              fill="#8884d8"
              fillOpacity={0.6}
              name="Planned Burn"
            />
            <Area 
              type="monotone" 
              dataKey="actualBurn" 
              stackId="2"
              stroke="#82ca9d" 
              fill="#82ca9d"
              fillOpacity={0.6}
              name="Actual Burn"
            />
          </AreaChart>
        )
      
      default:
        return null
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>{title}</span>
            </CardTitle>
            {description && (
              <CardDescription>{description}</CardDescription>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex space-x-1">
              {[
                { key: 'line', icon: TrendingUp, label: 'Line' },
                { key: 'bar', icon: BarChart3, label: 'Bar' },
                { key: 'area', icon: TrendingDown, label: 'Area' }
              ].map(({ key, icon: Icon, label }) => (
                <Button
                  key={key}
                  variant={chartType === key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartType(key as any)}
                >
                  <Icon className="h-4 w-4 mr-1" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Chart Controls */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="showVelocity"
                checked={showVelocity}
                onChange={(e) => setShowVelocity(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="showVelocity" className="text-sm">
                Show Velocity
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="showUtilization"
                checked={showUtilization}
                onChange={(e) => setShowUtilization(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="showUtilization" className="text-sm">
                Show Utilization
              </label>
            </div>
          </div>

          {/* Chart */}
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              {renderChart() || <div>No chart data available</div>}
            </ResponsiveContainer>
          </div>

          {/* Summary Stats */}
          {data.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {formatBudget(data.reduce((sum, d) => sum + d.plannedBurn, 0))}
                </p>
                <p className="text-xs text-muted-foreground">Total Planned</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {formatBudget(data.reduce((sum, d) => sum + d.actualBurn, 0))}
                </p>
                <p className="text-xs text-muted-foreground">Total Actual</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">
                  {data.reduce((sum, d) => sum + d.velocity, 0).toFixed(1)}
                </p>
                <p className="text-xs text-muted-foreground">Total Velocity</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {formatPercentage(data.reduce((sum, d) => sum + d.utilization, 0) / data.length)}
                </p>
                <p className="text-xs text-muted-foreground">Avg Utilization</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
