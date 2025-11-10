'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import { 
  DollarSign, 
  TrendingUp, 
  AlertCircle,
  Download,
  Filter
} from 'lucide-react'

interface ExpenseReportProps {
  topExpenses: {
    description: string
    amount: number
    category: string
    project: string
    date: string
  }[]
  budgetBreakdown: {
    category: string
    budgeted: number
    spent: number
    remaining: number
    utilizationRate: number
  }[]
  filters: any
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']

export function ExpenseReport({ topExpenses, budgetBreakdown, filters }: ExpenseReportProps) {
  // Calculate expense metrics
  const totalExpenses = topExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const averageExpense = topExpenses.length > 0 ? totalExpenses / topExpenses.length : 0
  const highestExpense = topExpenses.length > 0 ? Math.max(...topExpenses.map(e => e.amount)) : 0

  // Prepare data for charts
  const categoryExpenses = budgetBreakdown.map(item => ({
    category: item.category,
    spent: item.spent,
    budgeted: item.budgeted,
    utilization: item.utilizationRate
  }))

  const expenseData = topExpenses.map(expense => ({
    description: expense.description.length > 20 
      ? expense.description.substring(0, 20) + '...' 
      : expense.description,
    amount: expense.amount,
    category: expense.category,
    project: expense.project
  }))

  const categoryPieData = budgetBreakdown.map((item, index) => ({
    name: item.category,
    value: item.spent,
    color: COLORS[index % COLORS.length]
  }))

  return (
    <div className="space-y-6">
      {/* Expense Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Total Expenses</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold break-words">
              ${totalExpenses.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all categories
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Average Expense</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold break-words">
              ${averageExpense.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Per transaction
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Highest Expense</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold break-words">
              ${highestExpense.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Single transaction
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Total Transactions</CardTitle>
            <Badge variant="outline" className="flex-shrink-0 ml-2">{topExpenses.length}</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {topExpenses.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Expense entries
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Expenses by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Expenses by Category</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Distribution of expenses across categories</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={categoryPieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value, percent }) => `${name}: $${value.toLocaleString()} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={60}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Amount']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Spending vs Budget */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Category Spending vs Budget</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Actual spending compared to budgeted amounts</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={categoryExpenses}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Amount']} />
                <Bar dataKey="budgeted" fill="#8884d8" name="Budgeted" />
                <Bar dataKey="spent" fill="#82ca9d" name="Spent" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Expenses */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Top Expenses</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Highest value expense transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={expenseData.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="description" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Amount']} />
                <Bar dataKey="amount" fill="#FF8042" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Utilization */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Category Budget Utilization</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Percentage of budget used by category</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={categoryExpenses}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`${value}%`, 'Utilization']} />
                <Bar dataKey="utilization" fill="#FFBB28" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Expenses List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Top Expense Transactions</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Detailed list of highest value expenses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {topExpenses.map((expense, index) => (
              <div key={index} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-4">
                <div className="flex-1 min-w-0 w-full sm:w-auto">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3 flex-wrap gap-2">
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                        {index + 1}
                      </Badge>
                      <h3 className="font-semibold text-sm sm:text-base truncate">{expense.description}</h3>
                    </div>
                    <Badge variant="secondary" className="flex-shrink-0">{expense.category}</Badge>
                  </div>
                  <div className="mt-2 text-xs sm:text-sm text-muted-foreground">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-1 sm:space-y-0 sm:space-x-4">
                      <span className="break-words">Project: {expense.project}</span>
                      <span className="flex-shrink-0">Date: {new Date(expense.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
                  <div className="text-left sm:text-right w-full sm:w-auto">
                    <div className="text-base sm:text-lg font-bold break-words">
                      ${expense.amount.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Transaction Amount
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="w-full sm:w-auto flex-shrink-0">
                    <Download className="h-4 w-4 mr-2" />
                    Receipt
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Category Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Expense Category Analysis</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Detailed breakdown of expenses by category</CardDescription>
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
                  </div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
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
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
