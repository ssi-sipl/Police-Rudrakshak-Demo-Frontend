"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  User,
  Dog,
  Wifi,
  WifiOff,
  Camera,
  Clock,
  Calendar,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import Image from "next/image";

interface Alert {
  id: string;
  type: "person" | "animal";
  message: string;
  image: string;
  timestamp: Date;
  confidence?: number;
}

type DateFilter = "today" | "yesterday" | "last7days" | "last30days" | "all";

export default function DroneDashboard() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filteredAlerts, setFilteredAlerts] = useState<Alert[]>([]);
  const [currentAlert, setCurrentAlert] = useState<Alert | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [isLoading, setIsLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Backend API URL - replace with your actual backend URL
  const API_BASE_URL = "http://localhost:5000/api"; // Change this to your backend URL
  const WS_URL = "ws://localhost:5000"; // Change this to your WebSocket URL

  // Handle alert click - navigate to detail page
  const handleAlertClick = (alert: Alert) => {
    // Navigate to the alert detail page
    router.push(`/alert/${alert.id}`);
  };

  // Fetch alert history from backend
  const fetchAlertHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/alert`);
      if (!response.ok) {
        throw new Error("Failed to fetch alerts");
      }
      const data = await response.json();
      console.log("Fetched alert history:", data);

      // Transform the data to match our Alert interface
      const transformedAlerts: Alert[] = data?.data.map((alert: any) => ({
        id: alert.id,
        type: alert.type,
        message: alert.message,
        image: alert.image,
        timestamp: new Date(alert.createdAt),
        confidence: alert.confidence,
      }));

      setAlerts(transformedAlerts);
    } catch (error) {
      console.error("Error fetching alert history:", error);
      // You might want to show a toast notification here
    } finally {
      setIsLoading(false);
    }
  };

  // Filter alerts based on selected date range
  const filterAlertsByDate = (alerts: Alert[], filter: DateFilter): Alert[] => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (filter) {
      case "today":
        return alerts.filter((alert) => {
          const alertDate = new Date(
            alert.timestamp.getFullYear(),
            alert.timestamp.getMonth(),
            alert.timestamp.getDate()
          );
          return alertDate.getTime() === today.getTime();
        });
      case "yesterday":
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return alerts.filter((alert) => {
          const alertDate = new Date(
            alert.timestamp.getFullYear(),
            alert.timestamp.getMonth(),
            alert.timestamp.getDate()
          );
          return alertDate.getTime() === yesterday.getTime();
        });
      case "last7days":
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return alerts.filter((alert) => alert.timestamp >= sevenDaysAgo);
      case "last30days":
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return alerts.filter((alert) => alert.timestamp >= thirtyDaysAgo);
      case "all":
      default:
        return alerts;
    }
  };

  // Update filtered alerts when alerts or date filter changes
  useEffect(() => {
    const filtered = filterAlertsByDate(alerts, dateFilter);
    setFilteredAlerts(filtered);
  }, [alerts, dateFilter]);

  // Fetch initial data on component mount
  useEffect(() => {
    fetchAlertHistory();
  }, []);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const connectWebSocket = () => {
      setConnectionStatus("connecting");
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        setConnectionStatus("connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const newAlert: Alert = {
            id: data.id,
            type: data.type,
            message: data.message,
            image: data.image,
            timestamp: new Date(data.timestamp || Date.now()),
            confidence: data.confidence,
          };

          // Add new alert to the beginning of the list
          setAlerts((prev) => [newAlert, ...prev]);
          setCurrentAlert(newAlert);

          // Auto-hide current alert after 10 seconds
          setTimeout(() => {
            setCurrentAlert(null);
          }, 10000);
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        setIsConnected(false);
        setConnectionStatus("disconnected");
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setConnectionStatus("disconnected");
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "person":
        return <User className="h-5 w-5" />;
      case "animal":
        return <Dog className="h-5 w-5" />;
      default:
        return <AlertTriangle className="h-5 w-5" />;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case "person":
        return "bg-red-500";
      case "animal":
        return "bg-orange-500";
      default:
        return "bg-yellow-500";
    }
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getDateFilterLabel = (filter: DateFilter) => {
    switch (filter) {
      case "today":
        return "Today";
      case "yesterday":
        return "Yesterday";
      case "last7days":
        return "Last 7 days";
      case "last30days":
        return "Last 30 days";
      case "all":
        return "All time";
      default:
        return "Today";
    }
  };

  // Mock function to simulate alerts (remove in production)
  const simulateAlert = () => {
    const mockAlert: Alert = {
      id: Date.now().toString(),
      type: Math.random() > 0.5 ? "person" : "animal",
      message:
        Math.random() > 0.5
          ? "Person detected in restricted area"
          : "Animal spotted near perimeter",
      image: "/placeholder.svg?height=300&width=400",
      timestamp: new Date(),
      confidence: Math.round(Math.random() * 30 + 70), // 70-100%
    };

    setAlerts((prev) => [mockAlert, ...prev]);
    setCurrentAlert(mockAlert);

    setTimeout(() => {
      setCurrentAlert(null);
    }, 10000);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Camera className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Drone Surveillance
              </h1>
              <p className="text-gray-600">Real-time object detection alerts</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {isConnected ? (
                <Wifi className="h-5 w-5 text-green-500" />
              ) : (
                <WifiOff className="h-5 w-5 text-red-500" />
              )}
              <span
                className={`text-sm font-medium ${
                  isConnected ? "text-green-600" : "text-red-600"
                }`}
              >
                {connectionStatus.charAt(0).toUpperCase() +
                  connectionStatus.slice(1)}
              </span>
            </div>
            {/* Refresh button */}
            <Button
              onClick={fetchAlertHistory}
              variant="outline"
              size="sm"
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            {/* Mock button for testing */}
            <Button onClick={simulateAlert} variant="outline" size="sm">
              Simulate Alert
            </Button>
          </div>
        </div>

        {/* Current Alert */}
        {currentAlert && (
          <a
            href={`/alert/${currentAlert.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Card
              className={`border-l-4 ${getAlertColor(
                currentAlert.type
              )} animate-pulse cursor-pointer hover:shadow-lg transition-shadow`}
              // onClick={() => handleAlertClick(currentAlert)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {getAlertIcon(currentAlert.type)}
                    <CardTitle className="text-lg">LIVE ALERT</CardTitle>
                    <Badge variant="destructive">Active</Badge>
                    <ExternalLink className="h-4 w-4 text-gray-500" />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentAlert(null);
                    }}
                  >
                    ×
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-lg font-semibold">
                      {currentAlert.message}
                    </p>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <div className="flex items-center space-x-1">
                        <Clock className="h-4 w-4" />
                        <span>{formatTimestamp(currentAlert.timestamp)}</span>
                      </div>
                      {currentAlert.confidence && (
                        <Badge variant="secondary">
                          {currentAlert.confidence}% confidence
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="relative h-48 bg-gray-100 rounded-lg overflow-hidden">
                    <Image
                      src={currentAlert.image || "/placeholder.svg"}
                      alt="Detection"
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </a>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Alerts ({getDateFilterLabel(dateFilter)})
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredAlerts.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Person Detections
              </CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {
                  filteredAlerts.filter((alert) => alert.type === "person")
                    .length
                }
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Animal Detections
              </CardTitle>
              <Dog className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {
                  filteredAlerts.filter((alert) => alert.type === "animal")
                    .length
                }
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alert History */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Alert History</CardTitle>
                <CardDescription>
                  All detection alerts from your drone surveillance system.
                  Click on any alert to view details.
                </CardDescription>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={dateFilter}
                  onValueChange={(value: DateFilter) => setDateFilter(value)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="last7days">Last 7 days</SelectItem>
                    <SelectItem value="last30days">Last 30 days</SelectItem>
                    <SelectItem value="all">All time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96">
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">
                  <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-50 animate-spin" />
                  <p>Loading alerts...</p>
                </div>
              ) : filteredAlerts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>
                    No alerts found for{" "}
                    {getDateFilterLabel(dateFilter).toLowerCase()}.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredAlerts.map((alert, index) => (
                    <div key={alert.id}>
                      <a
                        href={`/alert/${alert.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <div
                          className="flex space-x-4 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors group"
                          // onClick={() => handleAlertClick(alert)}
                        >
                          <div
                            className={`w-2 h-2 rounded-full mt-2 ${getAlertColor(
                              alert.type
                            )}`}
                          />
                          <div className="flex-1 grid md:grid-cols-3 gap-4">
                            <div className="md:col-span-2 space-y-1">
                              <div className="flex items-center space-x-2">
                                {getAlertIcon(alert.type)}
                                <span className="font-medium">
                                  {alert.message}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {alert.type}
                                </Badge>
                                <ExternalLink className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                              <div className="flex items-center space-x-4 text-sm text-gray-600">
                                <span>{formatTimestamp(alert.timestamp)}</span>
                                {alert.confidence && (
                                  <span>{alert.confidence}% confidence</span>
                                )}
                              </div>
                            </div>
                            <div className="relative h-24 bg-gray-100 rounded overflow-hidden">
                              <Image
                                src={alert.image || "/placeholder.svg"}
                                alt="Detection"
                                fill
                                className="object-cover"
                              />
                            </div>
                          </div>
                        </div>
                      </a>
                      {index < filteredAlerts.length - 1 && (
                        <Separator className="mt-4" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
