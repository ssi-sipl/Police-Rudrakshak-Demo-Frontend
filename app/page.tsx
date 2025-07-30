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
  Plane,
  MapPin,
} from "lucide-react";
import Image from "next/image";

interface Alert {
  id: string;
  type: "person" | "animal";
  message: string;
  image?: string;
  timestamp: Date;
  confidence?: number;
  drone_id?: string;
  source?: "onboard" | "offboard"; // Add source field
}

type DateFilter = "today" | "yesterday" | "last7days" | "last30days" | "all";
type SourceFilter = "all" | "onboard" | "offboard";

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
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all"); // Add source filter state
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
  const [droneId] = useState("drone-1");
  const [allModesOff, setAllModesOff] = useState(false);

  // Backend API URL - replace with your actual backend URL
  const API_BASE_URL = "http://localhost:5000/api";
  const WS_URL = "ws://localhost:5000";

  // Handle alert click - navigate to detail page
  const handleAlertClick = (alert: Alert) => {
    router.push(`/alert/${alert.id}`);
  };

  // Fetch alert history from backendgit push --set-upstream origin version2development
  const fetchAlertHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/alert`);
      if (!response.ok) {
        throw new Error("Failed to fetch alerts");
      }
      const data = await response.json();
      console.log("Fetched alert history:", data);

      const transformedAlerts: Alert[] =
        data?.data?.map((alert: any) => ({
          id: alert.id || `alert-${Date.now()}-${Math.random()}`,
          type: alert.type,
          message: alert.message,
          image: alert.image || "/placeholder.svg?height=300&width=400",
          timestamp: new Date(alert.createdAt || alert.timestamp || Date.now()),
          confidence: alert.confidence,
          drone_id: alert.drone_id,
          source: alert.source || "onboard", // Default to onboard if not specified
        })) || [];

      console.log("Transformed alerts:", transformedAlerts);
      setAlerts(transformedAlerts);
    } catch (error) {
      console.error("Error fetching alert history:", error);
      // Set empty array on error to prevent undefined issues
      setAlerts([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter alerts based on selected date range and source
  const filterAlerts = (
    alerts: Alert[],
    dateFilter: DateFilter,
    sourceFilter: SourceFilter
  ): Alert[] => {
    let filtered = alerts;

    // Filter by source first
    if (sourceFilter !== "all") {
      filtered = filtered.filter((alert) => alert.source === sourceFilter);
    }

    // Then filter by date
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (dateFilter) {
      case "today":
        return filtered.filter((alert) => {
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
        return filtered.filter((alert) => {
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
        return filtered.filter((alert) => alert.timestamp >= sevenDaysAgo);
      case "last30days":
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return filtered.filter((alert) => alert.timestamp >= thirtyDaysAgo);
      case "all":
      default:
        return filtered;
    }
  };

  // Update filtered alerts when alerts, date filter, or source filter changes
  useEffect(() => {
    const filtered = filterAlerts(alerts, dateFilter, sourceFilter);
    setFilteredAlerts(filtered);
  }, [alerts, dateFilter, sourceFilter]);

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
          const message = JSON.parse(event.data);
          console.log("Received WebSocket data:", message);

          // Handle the new message format: { type: "alert", source: "onboard"/"offboard", data: alert }
          if (message.type === "alert" && message.data) {
            const alertData = message.data;
            const newAlert: Alert = {
              id: alertData.id || `alert-${Date.now()}-${Math.random()}`,
              type: alertData.type,
              message: alertData.message,
              image: alertData.image || "/placeholder.svg?height=300&width=400",
              timestamp: new Date(alertData.timestamp || Date.now()),
              confidence: alertData.confidence,
              drone_id: alertData.drone_id,
              source: message.source, // Extract source from the message wrapper
            };

            console.log("New alert created:", newAlert);
            console.log("Current source filter:", sourceFilter);
            console.log("Alert source:", message.source);
            console.log(
              "Should show live alert:",
              !isPaused &&
                (sourceFilter === "all" || sourceFilter === message.source)
            );

            // Add to batch
            alertBatchRef.current.push(newAlert);

            // Set current alert for live display (only if source matches current filter or filter is "all")
            if (
              !isPaused &&
              (sourceFilter === "all" || sourceFilter === message.source)
            ) {
              console.log("Showing live alert for source:", message.source);
              setCurrentAlert(newAlert);
              setLastAlertTime(new Date());
              setTimeout(() => {
                setCurrentAlert((prev) => {
                  if (prev?.id === newAlert.id) {
                    return null;
                  }
                  return prev;
                });
              }, 10000);
            } else {
              console.log(
                "Filtering out live alert - source:",
                message.source,
                "filter:",
                sourceFilter,
                "paused:",
                isPaused
              );
            }

            // Batch process alerts every 2 seconds
            if (batchTimeoutRef.current) {
              clearTimeout(batchTimeoutRef.current);
            }
            batchTimeoutRef.current = setTimeout(() => {
              if (alertBatchRef.current.length > 0) {
                setAlerts((prev) => {
                  const newAlerts = [
                    ...alertBatchRef.current.reverse(),
                    ...prev,
                  ];
                  return newAlerts.slice(0, 100);
                });
                setAlertCount((prev) => prev + alertBatchRef.current.length);
                alertBatchRef.current = [];
              }
            }, 2000);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        setIsConnected(false);
        setConnectionStatus("disconnected");
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
  }, [isPaused]); // Remove sourceFilter from here

  // Clear current alert if it doesn't match the new source filter
  useEffect(() => {
    if (
      currentAlert &&
      sourceFilter !== "all" &&
      currentAlert.source !== sourceFilter
    ) {
      console.log("Clearing current alert due to source filter change");
      setCurrentAlert(null);
    }
  }, [sourceFilter, currentAlert]);

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

  const getSourceIcon = (source?: string) => {
    switch (source) {
      case "onboard":
        return <Plane className="h-4 w-4" />;
      case "offboard":
        return <MapPin className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getSourceColor = (source?: string) => {
    switch (source) {
      case "onboard":
        return "bg-blue-100 text-blue-800";
      case "offboard":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
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

  const getSourceFilterLabel = (filter: SourceFilter) => {
    switch (filter) {
      case "all":
        return "All Sources";
      case "onboard":
        return "Onboard";
      case "offboard":
        return "Offboard";
      default:
        return "All Sources";
    }
  };

  const formatConfidence = (confidence?: number) => {
    if (!confidence) return null;
    const percentage =
      confidence < 1 ? Math.round(confidence * 100) : Math.round(confidence);
    return `${percentage}%`;
  };

  // Mock function to simulate alerts (remove in production)
  const simulateAlert = () => {
    const sources: ("onboard" | "offboard")[] = ["onboard", "offboard"];
    const randomSource = sources[Math.floor(Math.random() * sources.length)];

    const mockAlert: Alert = {
      id: Date.now().toString(),
      type: Math.random() > 0.5 ? "person" : "animal",
      message:
        Math.random() > 0.5
          ? "Person detected in restricted area"
          : "Animal spotted near perimeter",
      timestamp: new Date(),
      confidence: Math.random() * 0.3 + 0.7,
      drone_id: "drone-1",
      image: "/placeholder.svg?height=300&width=400",
      source: randomSource,
    };

    setAlerts((prev) => [mockAlert, ...prev]);

    // Only show as current alert if it matches the current filter
    if (sourceFilter === "all" || sourceFilter === randomSource) {
      setCurrentAlert(mockAlert);
      setTimeout(() => {
        setCurrentAlert(null);
      }, 10000);
    }
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

      setCurrentMode(newMode);
      setAllModesOff(false);
      console.log(`Successfully switched to ${newMode} mode`);
    } catch (error) {
      console.error("Error switching mode:", error);
    } finally {
      setIsSwitchingMode(false);
    }
  };

  // Turn off all modes
  const turnOffAllModes = async () => {
    setIsSwitchingMode(true);
    try {
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
                <Separator orientation="vertical" className="h-6" />
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-600">
                    Source:
                  </span>
                  <div className="flex items-center bg-gray-100 rounded-lg p-1">
                    <Button
                      onClick={() => setSourceFilter("all")}
                      variant="ghost"
                      size="sm"
                      className={`h-7 px-3 text-xs ${
                        sourceFilter === "all"
                          ? "bg-white shadow-sm"
                          : "hover:bg-gray-200"
                      }`}
                    >
                      All
                    </Button>
                    <Button
                      onClick={() => setSourceFilter("onboard")}
                      variant="ghost"
                      size="sm"
                      className={`h-7 px-3 text-xs ${
                        sourceFilter === "onboard"
                          ? "bg-white shadow-sm"
                          : "hover:bg-gray-200"
                      }`}
                    >
                      <Plane className="h-3 w-3 mr-1" />
                      Onboard
                    </Button>
                    <Button
                      onClick={() => setSourceFilter("offboard")}
                      variant="ghost"
                      size="sm"
                      className={`h-7 px-3 text-xs ${
                        sourceFilter === "offboard"
                          ? "bg-white shadow-sm"
                          : "hover:bg-gray-200"
                      }`}
                    >
                      <MapPin className="h-3 w-3 mr-1" />
                      Offboard
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  {lastAlertTime && (
                    <span>Last alert: {formatTimestamp(lastAlertTime)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-4 text-sm">
                <span className="text-gray-600">
                  Showing:{" "}
                  <span className="font-semibold">{filteredAlerts.length}</span>{" "}
                  of <span className="font-semibold">{alerts.length}</span>{" "}
                  alerts
                </span>
                <span className="text-gray-600">
                  Total today:{" "}
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

        {/* Current Alert - With Image */}
        {currentAlert && !isPaused && (
          <Card
            className={`border-l-4 ${getAlertColor(
              currentAlert.type
            )} animate-pulse`}
          >
            <a
              href={`/alert/${currentAlert.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="... block"
            >
              <CardContent className="py-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-3">
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
                            {currentAlert.source && (
                              <Badge
                                variant="outline"
                                className={`text-xs ${getSourceColor(
                                  currentAlert.source
                                )}`}
                              >
                                {getSourceIcon(currentAlert.source)}
                                <span className="ml-1 capitalize">
                                  {currentAlert.source}
                                </span>
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {currentAlert.message}
                          </p>
                          <div className="flex items-center space-x-3 text-xs text-gray-500 mt-1">
                            <span>
                              {formatTimestamp(currentAlert.timestamp)}
                            </span>
                            {currentAlert.confidence && (
                              <span>
                                {formatConfidence(currentAlert.confidence)}{" "}
                                confidence
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
                  </div>
                  <div className="relative h-48 bg-gray-100 rounded-lg overflow-hidden">
                    <Image
                      src={
                        currentAlert.image ||
                        "/placeholder.svg?height=300&width=400" ||
                        "/placeholder.svg"
                      }
                      alt="Detection"
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>
              </CardContent>
            </a>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Onboard vs Offboard
              </CardTitle>
              <Plane className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Onboard:</span>
                  <span className="font-semibold">
                    {
                      filteredAlerts.filter(
                        (alert) => alert.source === "onboard"
                      ).length
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Offboard:</span>
                  <span className="font-semibold">
                    {
                      filteredAlerts.filter(
                        (alert) => alert.source === "offboard"
                      ).length
                    }
                  </span>
                </div>
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
                    {getDateFilterLabel(dateFilter).toLowerCase()}
                    {sourceFilter !== "all" && ` from ${sourceFilter} source`}.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAlerts.map((alert, index) => (
                    <a
                      key={alert.id}
                      href={`/alert/${alert.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="... block"
                    >
                      <div key={alert.id}>
                        <div
                          className="flex space-x-4 p-3 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                          // onClick={() => handleAlertClick(alert)}
                        >
                          <div
                            className={`w-3 h-3 rounded-full mt-2 ${getAlertColor(
                              alert.type
                            )}`}
                          />
                          <div className="flex-1 grid md:grid-cols-3 gap-4">
                            <div className="md:col-span-2 space-y-1">
                              <div className="flex items-center space-x-2">
                                {getAlertIcon(alert.type)}
                                <span className="font-medium text-sm">
                                  {alert.message}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {alert.type}
                                </Badge>
                                {alert.source && (
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${getSourceColor(
                                      alert.source
                                    )}`}
                                  >
                                    {getSourceIcon(alert.source)}
                                    <span className="ml-1 capitalize">
                                      {alert.source}
                                    </span>
                                  </Badge>
                                )}
                                <ExternalLink className="h-4 w-4 text-gray-400" />
                              </div>
                              <div className="flex items-center space-x-4 text-xs text-gray-500">
                                <span>{formatTimestamp(alert.timestamp)}</span>
                                {alert.confidence && (
                                  <span>
                                    {formatConfidence(alert.confidence)}{" "}
                                    confidence
                                  </span>
                                )}
                                {alert.drone_id && (
                                  <span>{alert.drone_id}</span>
                                )}
                              </div>
                            </div>
                            <div className="relative h-24 bg-gray-100 rounded overflow-hidden">
                              <Image
                                src={
                                  alert.image ||
                                  "/placeholder.svg?height=300&width=400" ||
                                  "/placeholder.svg"
                                }
                                alt="Detection"
                                fill
                                className="object-cover"
                              />
                            </div>
                          </div>
                        </div>
                        {index < filteredAlerts.length - 1 && <Separator />}
                      </div>
                    </a>
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
