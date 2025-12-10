'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line
} from 'recharts'
import { PieChart as PieChartIcon, BarChart3, TrendingUp, DollarSign } from 'lucide-react'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'

interface BudgetData {
  category: string
  amount: number
  color: string
}

interface BudgetChartProps {
  data: BudgetData[]
  title?: string
  description?: string
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']

export function BudgetChart({ data, title = "Budget Breakdown", description }: BudgetChartProps) {
  const [chartType, setChartType] = useState<'pie' | 'bar' | 'line'>('pie')
  const [showLegend, setShowLegend] = useState(true)
  const { formatCurrency } = useOrgCurrency()

  const formatBudget = (value: number) =>
    formatCurrency(value, undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="font-medium">{data.category}</p>
          <p className="text-sm" style={{ color: data.color }}>
            {formatBudget(data.amount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {((data.amount / data.totalAmount) * 100).toFixed(1)}% of total
          </p>
        </div>
      )
    }
    return null
  }

  const renderChart = () => {
    const totalAmount = data.reduce((sum, item) => sum + item.amount, 0)
    const chartData = data.map(item => ({ ...item, totalAmount }))

    switch (chartType) {
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ category, percent }) => 
                `${category}: ${(percent * 100).toFixed(0)}%`
              }
              outerRadius={120}
              fill="#8884d8"
              dataKey="amount"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
          </PieChart>
        )
      
      case 'bar':
        return (
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="category" 
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              tickFormatter={formatBudget}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
            <Bar dataKey="amount" fill="#8884d8">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        )
      
      case 'line':
        return (
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="category" 
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              tickFormatter={formatBudget}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
            <Line 
              type="monotone" 
              dataKey="amount" 
              stroke="#8884d8" 
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        )
      
      default:
        return null
    }
  }

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0)
  const maxCategory = data.reduce((max, item) => item.amount > max.amount ? item : max, data[0] || { amount: 0, category: '' })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5" />
              <span>{title}</span>
            </CardTitle>
            {description && (
              <CardDescription>{description}</CardDescription>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex space-x-1">
              {[
                { key: 'pie', icon: PieChartIcon, label: 'Pie' },
                { key: 'bar', icon: BarChart3, label: 'Bar' },
                { key: 'line', icon: TrendingUp, label: 'Line' }
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
                id="showLegend"
                checked={showLegend}
                onChange={(e) => setShowLegend(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="showLegend" className="text-sm">
                Show Legend
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {formatBudget(totalAmount)}
                </p>
                <p className="text-xs text-muted-foreground">Total Budget</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {maxCategory.category}
                </p>
                <p className="text-xs text-muted-foreground">Largest Category</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {formatBudget(maxCategory.amount)}
                </p>
                <p className="text-xs text-muted-foreground">Max Amount</p>
              </div>
            </div>
          )}

          {/* Category Breakdown */}
          <div className="space-y-2 pt-4 border-t">
            <h4 className="text-sm font-medium">Category Breakdown</h4>
            <div className="space-y-1">
              {data.map((item, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: item.color || COLORS[index % COLORS.length] }}
                    ></div>
                    <span className="capitalize">{item.category}</span>
                  </div>
                  <div className="text-right">
                  <span className="font-medium">{formatBudget(item.amount)}</span>
                    <span className="text-muted-foreground ml-2">
                      ({((item.amount / totalAmount) * 100).toFixed(1)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
