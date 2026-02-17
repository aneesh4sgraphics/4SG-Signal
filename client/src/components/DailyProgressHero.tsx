import { Flame, CheckCircle2, Clock, Target, Zap, ChevronRight } from "lucide-react"
import { Link } from "wouter"

interface UpcomingTask {
  id: string
  title: string
  time: string
  type: "call" | "meeting" | "followup"
}

interface DailyProgressHeroProps {
  completionPercent: number
  tasksToday: number
  overdueCount: number
  hotLeadsCount: number
  upcomingTasks?: UpcomingTask[]
  dailyGoal?: number
}

export function DailyProgressHero({
  completionPercent,
  tasksToday,
  overdueCount,
  hotLeadsCount,
  upcomingTasks = [],
  dailyGoal = 8,
}: DailyProgressHeroProps) {
  const circumference = 2 * Math.PI * 52
  const strokeDashoffset = circumference - (completionPercent / 100) * circumference
  const completedTasks = Math.round((completionPercent / 100) * tasksToday)

  const getTypeColor = (type: UpcomingTask["type"]) => {
    switch (type) {
      case "call":
        return "bg-[#8B7EC8]"
      case "meeting":
        return "bg-[#7CB89E]"
      case "followup":
        return "bg-[#E5A853]"
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-white to-purple-50 p-6 backdrop-blur-sm border border-gray-200 shadow-sm">
      <div className="flex items-end justify-between gap-6">
        {/* Left Section: Progress Ring + Stats */}
        <div className="flex items-center gap-6">
          {/* Progress Ring */}
          <div className="relative flex-shrink-0">
            <svg width="120" height="120" className="transform -rotate-90">
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-purple-100"
              />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="url(#progressGradient)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8B7EC8" />
                  <stop offset="100%" stopColor="#7CB89E" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-gray-900">{completionPercent}%</span>
              <span className="text-xs text-gray-500">completed</span>
            </div>
          </div>

          {/* Stat Pills */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm border border-gray-200">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              <span className="text-sm text-gray-900 font-medium">{tasksToday} tasks today</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm border border-gray-200">
              <span className={`h-2 w-2 rounded-full ${overdueCount > 0 ? 'bg-red-500' : 'bg-green-500'}`} />
              <span className="text-sm text-gray-900 font-medium">{overdueCount} overdue</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm border border-gray-200">
              <Flame className="h-4 w-4 text-orange-500" />
              <span className="text-sm text-gray-900 font-medium">{hotLeadsCount} hot leads</span>
            </div>
          </div>
        </div>

        {/* Right Section: Spotlight CTA - Star Product (Takes Half Width) */}
        <div className="hidden md:flex items-end flex-1">
          <Link href="/" className="flex-1">
            <div className="group relative h-full min-h-[120px] flex items-center justify-center gap-6 px-8 rounded-2xl bg-gradient-to-br from-[#8B7EC8] via-[#7B6BA5] to-[#6B5B95] hover:from-[#9B8ED8] hover:via-[#8B7BB5] hover:to-[#7B6BA5] cursor-pointer transition-all duration-300 shadow-lg hover:shadow-xl">
              <div className="absolute inset-0 rounded-2xl bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-16 h-16 rounded-xl bg-white/25 flex items-center justify-center group-hover:bg-white/35 transition-colors shadow-inner flex-shrink-0">
                <Zap className="h-8 w-8 text-white drop-shadow-sm" />
              </div>
              <div className="text-left">
                <p className="text-xl font-bold text-white tracking-wide">Spotlight</p>
                <p className="text-sm text-white/80 mt-1">Focus on one client at a time</p>
                <p className="text-xs text-white/60 mt-0.5">Your daily coaching treadmill</p>
              </div>
              <ChevronRight className="h-6 w-6 text-white/70 group-hover:text-white group-hover:translate-x-1 transition-all ml-auto" />
            </div>
          </Link>
        </div>
      </div>

      {/* Mobile Spotlight Button */}
      <Link href="/" className="md:hidden block mt-4">
        <div className="flex items-center justify-between p-5 rounded-2xl bg-gradient-to-r from-[#8B7EC8] via-[#7B6BA5] to-[#6B5B95] cursor-pointer shadow-lg active:scale-[0.98] transition-transform">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white/25 flex items-center justify-center shadow-inner">
              <Zap className="h-7 w-7 text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-white">Spotlight</p>
              <p className="text-sm text-white/70">Focus on one client at a time</p>
            </div>
          </div>
          <ChevronRight className="h-6 w-6 text-white" />
        </div>
      </Link>
    </div>
  )
}
