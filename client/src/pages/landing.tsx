import { Button } from "@/components/ui/button";
import logo from "@assets/4s logo Clean High res_1752588087394.jpg";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="mb-6">
            <img 
              src={logo} 
              alt="4S Graphics Logo" 
              className="w-32 h-32 mx-auto object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-8">
            Employee Login
          </h1>
          <Button 
            size="lg" 
            onClick={() => window.location.href = "/api/login"}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-lg w-full"
          >
            Login
          </Button>
        </div>
      </div>
    </div>
  );
}