import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  FileText, 
  Package,
  DollarSign,
  Calendar,
  Target,
  ArrowRight
} from "lucide-react";

interface ReportTile {
  title: string;
  description: string;
  icon: typeof BarChart3;
  href: string;
  status: 'available' | 'coming_soon';
  category: string;
}

const reports: ReportTile[] = [
  {
    title: "Sales Analytics",
    description: "Track quoted vs invoiced amounts over time with conversion rates and trends",
    icon: TrendingUp,
    href: "/sales-analytics",
    status: "available",
    category: "Sales"
  },
  {
    title: "Quote Pipeline",
    description: "Monitor quote follow-ups, conversion stages, and close rates by rep",
    icon: FileText,
    href: "/reports/pipeline",
    status: "coming_soon",
    category: "Sales"
  },
  {
    title: "Customer Activity",
    description: "See engagement scores, stalled accounts, and next best actions",
    icon: Users,
    href: "/reports/customer-activity",
    status: "coming_soon",
    category: "CRM"
  },
  {
    title: "Product Performance",
    description: "Top quoted products, margin analysis, and category trends",
    icon: Package,
    href: "/reports/products",
    status: "coming_soon",
    category: "Products"
  },
  {
    title: "Revenue Forecast",
    description: "Projected revenue based on pipeline and historical conversion",
    icon: DollarSign,
    href: "/reports/forecast",
    status: "coming_soon",
    category: "Finance"
  },
  {
    title: "Rep Scorecards",
    description: "Individual performance metrics, quote volume, and win rates",
    icon: Target,
    href: "/reports/scorecards",
    status: "coming_soon",
    category: "Team"
  },
];

export default function ReportsPage() {
  const categories = [...new Set(reports.map(r => r.category))];
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-purple-600" />
            Reports Hub
          </h1>
          <p className="text-muted-foreground mt-2">
            Access all your business intelligence and analytics in one place
          </p>
        </div>

        {categories.map(category => (
          <div key={category} className="mb-8">
            <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {category}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reports.filter(r => r.category === category).map(report => {
                const Icon = report.icon;
                const isAvailable = report.status === 'available';
                
                return isAvailable ? (
                  <Link key={report.title} href={report.href}>
                    <Card 
                      className="cursor-pointer hover:shadow-lg hover:border-purple-300 transition-all group h-full"
                      data-testid={`report-tile-${report.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
                            <Icon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                          </div>
                          <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-purple-600 transition-colors" />
                        </div>
                        <CardTitle className="text-lg mt-3">{report.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <CardDescription>{report.description}</CardDescription>
                      </CardContent>
                    </Card>
                  </Link>
                ) : (
                  <Card 
                    key={report.title}
                    className="opacity-60 h-full"
                    data-testid={`report-tile-${report.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                          <Icon className="h-5 w-5 text-gray-400" />
                        </div>
                        <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
                      </div>
                      <CardTitle className="text-lg mt-3 text-gray-500">{report.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>{report.description}</CardDescription>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        <Card className="mt-8 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950 dark:to-indigo-950 border-purple-200 dark:border-purple-800">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900">
                <BarChart3 className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Need a custom report?</h3>
                <p className="text-sm text-muted-foreground">
                  More reports are being added based on your team's needs. Let us know what insights would help!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
