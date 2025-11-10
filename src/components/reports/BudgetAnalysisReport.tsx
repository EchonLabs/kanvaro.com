'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts'
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  Target
} from 'lucide-react'

interface BudgetAnalysisReportProps {
  budgetBreakdown: {
    category: string
    budgeted: number
    spent: number
    remaining: number
    utilizationRate: number
  }[]
  monthlyTrends: {
    month: string
    budget: number
    spent: number
    revenue: number
    profit: number
  }[]
  filters: any
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']

export function BudgetAnalysisReport({ budgetBreakdown, monthlyTrends, filters }: BudgetAnalysisReportProps) {
  // Calculate budget metrics
  const totalBudgeted = budgetBreakdown.reduce((sum, item) => sum + item.budgeted, 0)
  const totalSpent = budgetBreakdown.reduce((sum, item) => sum + item.spent, 0)
  const totalRemaining = budgetBreakdown.reduce((sum, item) => sum + item.remaining, 0)
  const averageUtilization = budgetBreakdown.length > 0 
    ? budgetBreakdown.reduce((sum, item) => sum + item.utilizationRate, 0) / budgetBreakdown.length 
    : 0

  // Prepare data for charts
  const categoryData = budgetBreakdown.map((item, index) => ({
    name: item.category,
    budgeted: item.budgeted,
    spent: item.spent,
    remaining: item.remaining,
    utilization: item.utilizationRate,
    color: COLORS[index % COLORS.length]
  }))

  const utilizationData = budgetBreakdown.map(item => ({
    category: item.category,
    utilization: item.utilizationRate,
    budgeted: item.budgeted,
    spent: item.spent
  }))

  const monthlyBudgetData = monthlyTrends.map(trend => ({
    month: trend.month,
    budget: trend.budget,
    spent: trend.spent,
    variance: trend.budget - trend.spent,
    utilization: trend.budget > 0 ? (trend.spent / trend.budget) * 100 : 0
  }))

  return (
    <div className="space-y-6">
      {/* Budget Analysis Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Total Budgeted</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold break-words">
              ${totalBudgeted.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all categories
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Total Spent</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold break-words">
              ${totalSpent.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalBudgeted > 0 ? ((totalSpent / totalBudgeted) * 100).toFixed(1) : 0}% of budget
            </p>
            <Progress value={totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Remaining Budget</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold break-words">
              ${totalRemaining.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Available to spend
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Average Utilization</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {averageUtilization.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across categories
            </p>
            <Progress value={averageUtilization} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Budget vs Spent by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Budget vs Spent by Category</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Budget allocation vs actual spending</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Amount']} />
                <Bar dataKey="budgeted" fill="#8884d8" name="Budgeted" />
                <Bar dataKey="spent" fill="#82ca9d" name="Spent" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Budget Utilization by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Budget Utilization by Category</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Percentage of budget used by category</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={utilizationData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`${value}%`, 'Utilization']} />
                <Bar dataKey="utilization" fill="#FFBB28" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly Budget Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Monthly Budget Trends</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Budget and spending over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={monthlyBudgetData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Amount']} />
                <Area 
                  type="monotone" 
                  dataKey="budget" 
                  stackId="1" 
                  stroke="#8884d8" 
                  fill="#8884d8" 
                  fillOpacity={0.6}
                  name="Budget"
                />
                <Area 
                  type="monotone" 
                  dataKey="spent" 
                  stackId="2" 
                  stroke="#82ca9d" 
                  fill="#82ca9d" 
                  fillOpacity={0.6}
                  name="Spent"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Budget Variance Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Budget Variance Analysis</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Monthly budget vs actual spending variance</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={monthlyBudgetData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Variance']} />
                <Line 
                  type="monotone" 
                  dataKey="variance" 
                  stroke="#FF8042" 
                  strokeWidth={2}
                  name="Budget Variance"
                />
                <Line 
                  type="monotone" 
                  dataKey="utilization" 
                  stroke="#FFBB28" 
                  strokeWidth={2}
                  name="Utilization %"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Budget Category Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Budget Category Analysis</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Detailed breakdown of budget performance by category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {budgetBreakdown.map((category, index) => (
              <div key={category.category} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-4">
                <div className="flex-1 min-w-0 w-full sm:w-auto">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3 flex-wrap gap-2">
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-3 h-3 sm:w-4 sm:h-4 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <h3 className="font-semibold text-sm sm:text-base truncate">{category.category}</h3>
                    </div>
                    <Badge variant={category.utilizationRate > 80 ? 'destructive' : 
                                   category.utilizationRate > 60 ? 'default' : 'secondary'} className="flex-shrink-0">
                      {category.utilizationRate.toFixed(1)}% used
                    </Badge>
                    {category.utilizationRate > 100 && (
                      <Badge variant="destructive" className="flex items-center space-x-1 flex-shrink-0">
                        <AlertCircle className="h-3 w-3" />
                        <span className="text-xs sm:text-sm">Over Budget</span>
                      </Badge>
                    )}
                  </div>
                  
                  <div className="mt-3 space-y-2">
                    <div>
                      <div className="flex items-center justify-between text-xs sm:text-sm mb-1">
                        <span>Budget Utilization</span>
                        <span className="flex-shrink-0 ml-2">{category.utilizationRate.toFixed(1)}%</span>
                      </div>
                      <Progress value={Math.min(100, category.utilizationRate)} className="h-2" />
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
                      <div>
                        <div className="text-muted-foreground">Budgeted</div>
                        <div className="font-medium break-words">${category.budgeted.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Spent</div>
                        <div className="font-medium break-words">${category.spent.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Remaining</div>
                        <div className={`font-medium break-words ${category.remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ${category.remaining.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
