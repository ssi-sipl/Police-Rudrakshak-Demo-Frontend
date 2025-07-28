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
  Calendar,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

interface Alert {
  id: string;
  type: "person" | "animal";
  message: string;
  timestamp: Date;
  confidence?: number;
  drone_id?: string;
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

  const [alertQueue, setAlertQueue] = useState<Alert[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [lastAlertTime, setLastAlertTime] = useState<Date | null>(null);
  const alertBatchRef = useRef<Alert[]>([]);
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [currentMode, setCurrentMode] = useState<
    "detection" | "facerecognition"
  >("detection");
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [droneId] = useState("drone-1"); // You can make this configurable later
  const [allModesOff, setAllModesOff] = useState(false);

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
        id: alert.id || `alert-${Date.now()}-${Math.random()}`,
        type: alert.type,
        message: alert.message,
        timestamp: new Date(alert.createdAt || alert.timestamp || Date.now()),
        confidence: alert.confidence,
        drone_id: alert.drone_id,
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
          console.log("Received WebSocket data:", data);

          const newAlert: Alert = {
            id: data.id || `alert-${Date.now()}-${Math.random()}`,
            type: data.type,
            message: data.message,
            timestamp: new Date(data.timestamp || Date.now()),
            confidence: data.confidence,
            drone_id: data.drone_id,
          };

          // Add to batch
          alertBatchRef.current.push(newAlert);

          // Set current alert for live display
          if (!isPaused) {
            setCurrentAlert(newAlert);
            setLastAlertTime(new Date());
          }

          // Batch process alerts every 2 seconds
          if (batchTimeoutRef.current) {
            clearTimeout(batchTimeoutRef.current);
          }

          batchTimeoutRef.current = setTimeout(() => {
            if (alertBatchRef.current.length > 0) {
              setAlerts((prev) => [
                ...alertBatchRef.current.reverse(),
                ...prev,
              ]);
              setAlertCount((prev) => prev + alertBatchRef.current.length);
              alertBatchRef.current = [];
            }
          }, 2000);
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

  // Format confidence as percentage
  const formatConfidence = (confidence?: number) => {
    if (!confidence) return null;
    // If confidence is between 0 and 1, convert to percentage
    const percentage =
      confidence < 1 ? Math.round(confidence * 100) : Math.round(confidence);
    return `${percentage}%`;
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
      timestamp: new Date(),
      confidence: Math.random() * 0.3 + 0.7, // 0.7-1.0 to match your backend format
      drone_id: "drone-1",
    };

    setAlerts((prev) => [mockAlert, ...prev]);
    setCurrentAlert(mockAlert);
    setTimeout(() => {
      setCurrentAlert(null);
    }, 10000);
  };

  // Switch between detection and face recognition modes
  const switchMode = async (newMode: "detection" | "facerecognition") => {
    setIsSwitchingMode(true);

    try {
      const endpoint =
        newMode === "facerecognition"
          ? `${API_BASE_URL}/process/facerecognition`
          : `${API_BASE_URL}/process/detection`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "on",
          drone_id: droneId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to switch to ${newMode} mode`);
      }

      // Turn off the previous mode
      // const previousMode = currentMode;
      // const previousEndpoint =
      //   previousMode === "facerecognition"
      //     ? `${API_BASE_URL}/process/facerecognition`
      //     : `${API_BASE_URL}/process/detection`;

      // await fetch(previousEndpoint, {
      //   method: "POST",
      //   headers: {
      //     "Content-Type": "application/json",
      //   },
      //   body: JSON.stringify({
      //     action: "off",
      //     drone_id: droneId,
      //   }),
      // });

      setCurrentMode(newMode);
      setAllModesOff(false);
      // console.log(`Successfully switched to ${newMode} mode`);
    } catch (error) {
      console.error("Error switching mode:", error);
      // You might want to show a toast notification here
    } finally {
      setIsSwitchingMode(false);
    }
  };

  // Turn off all modes
  const turnOffAllModes = async () => {
    setIsSwitchingMode(true);

    try {
      // Turn off detection mode
      const detectionResponse = await fetch(
        `${API_BASE_URL}/process/detection`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "off",
            drone_id: droneId,
          }),
        }
      );

      // Turn off face recognition mode
      const frResponse = await fetch(
        `${API_BASE_URL}/process/facerecognition`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "off",
            drone_id: droneId,
          }),
        }
      );

      if (!detectionResponse.ok || !frResponse.ok) {
        throw new Error("Failed to turn off all modes");
      }

      setAllModesOff(true);
      console.log("Successfully turned off all modes");
    } catch (error) {
      console.error("Error turning off all modes:", error);
      // You might want to show a toast notification here
    } finally {
      setIsSwitchingMode(false);
    }
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
              <p className="text-gray-600">
                Real-time object detection alerts -{" "}
                {allModesOff
                  ? "All Modes Off"
                  : currentMode === "detection"
                  ? "Detection"
                  : "Face Recognition"}{" "}
                Mode
              </p>
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

        {/* Mode Control Panel */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Camera className="h-5 w-5 text-blue-600" />
                  <span className="font-medium">Processing Mode:</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Button
                    onClick={() => switchMode("detection")}
                    variant={
                      currentMode === "detection" && !allModesOff
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    disabled={isSwitchingMode}
                    className={
                      currentMode === "detection" && !allModesOff
                        ? "bg-blue-600 hover:bg-blue-700"
                        : ""
                    }
                  >
                    {currentMode === "detection" && !allModesOff && (
                      <div className="w-2 h-2 bg-green-400 rounded-full mr-2" />
                    )}
                    Detection
                  </Button>
                  <Button
                    onClick={() => switchMode("facerecognition")}
                    variant={
                      currentMode === "facerecognition" && !allModesOff
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    disabled={isSwitchingMode}
                    className={
                      currentMode === "facerecognition" && !allModesOff
                        ? "bg-purple-600 hover:bg-purple-700"
                        : ""
                    }
                  >
                    {currentMode === "facerecognition" && !allModesOff && (
                      <div className="w-2 h-2 bg-green-400 rounded-full mr-2" />
                    )}
                    Face Recognition
                  </Button>
                  <Separator orientation="vertical" className="h-6" />
                  <Button
                    onClick={turnOffAllModes}
                    variant={allModesOff ? "default" : "outline"}
                    size="sm"
                    disabled={isSwitchingMode}
                    className={
                      allModesOff
                        ? "bg-red-600 hover:bg-red-700"
                        : "hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                    }
                  >
                    {allModesOff && (
                      <div className="w-2 h-2 bg-green-400 rounded-full mr-2" />
                    )}
                    Turn Off All
                  </Button>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-600">
                  <span>Status: </span>
                  <Badge variant={allModesOff ? "destructive" : "default"}>
                    {allModesOff
                      ? "All Off"
                      : currentMode === "detection"
                      ? "Detection Active"
                      : "Face Recognition Active"}
                  </Badge>
                </div>
                <div className="text-sm text-gray-600">
                  <span>Drone ID: </span>
                  <Badge variant="outline">{droneId}</Badge>
                </div>
                {isSwitchingMode && (
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Switching mode...</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alert Controls */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  onClick={() => setIsPaused(!isPaused)}
                  variant={isPaused ? "default" : "outline"}
                  size="sm"
                >
                  {isPaused ? "Resume" : "Pause"} Live Updates
                </Button>
                <div className="text-sm text-gray-600">
                  {lastAlertTime && (
                    <span>Last alert: {formatTimestamp(lastAlertTime)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-4 text-sm">
                <span className="text-gray-600">
                  Total alerts today:{" "}
                  <span className="font-semibold">{alertCount}</span>
                </span>
                {alertBatchRef.current.length > 0 && (
                  <Badge variant="secondary">
                    {alertBatchRef.current.length} pending
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Alert - Compact Version */}
        {currentAlert && !isPaused && (
          <Card
            className={`border-l-4 ${getAlertColor(
              currentAlert.type
            )} animate-pulse`}
          >
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getAlertIcon(currentAlert.type)}
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold">LIVE ALERT</span>
                      <Badge variant="destructive" className="text-xs">
                        Active
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {currentAlert.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {currentAlert.message}
                    </p>
                    <div className="flex items-center space-x-3 text-xs text-gray-500 mt-1">
                      <span>{formatTimestamp(currentAlert.timestamp)}</span>
                      {currentAlert.confidence && (
                        <span>
                          {formatConfidence(currentAlert.confidence)} confidence
                        </span>
                      )}
                      {currentAlert.drone_id && (
                        <span>{currentAlert.drone_id}</span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentAlert(null)}
                >
                  ×
                </Button>
              </div>
            </CardContent>
          </Card>
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
                <div className="space-y-2">
                  {filteredAlerts.map((alert, index) => (
                    <div key={alert.id}>
                      <div
                        className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                        onClick={() => handleAlertClick(alert)}
                      >
                        <div
                          className={`w-3 h-3 rounded-full ${getAlertColor(
                            alert.type
                          )}`}
                        />
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            {getAlertIcon(alert.type)}
                            <span className="font-medium text-sm">
                              {alert.message}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {alert.type}
                            </Badge>
                          </div>
                          <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                            <span>{formatTimestamp(alert.timestamp)}</span>
                            {alert.confidence && (
                              <span>
                                {formatConfidence(alert.confidence)} confidence
                              </span>
                            )}
                            {alert.drone_id && <span>{alert.drone_id}</span>}
                          </div>
                        </div>
                        <ExternalLink className="h-4 w-4 text-gray-400" />
                      </div>
                      {index < filteredAlerts.length - 1 && <Separator />}
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
