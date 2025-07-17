"use client";
import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";

import { useRouter, useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  User,
  Dog,
  Camera,
  Clock,
  ArrowLeft,
  Download,
  Share,
  MapPin,
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

export default function AlertDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [alert, setAlert] = useState<Alert | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const alertId = params.id as string;

    const fetchAlert = async () => {
      try {
        const response = await fetch(
          `http://localhost:5000/api/alert/${alertId}`
        );
        if (response.ok) {
          const data = await response.json();
          const alertData: Alert = {
            id: data.data.id,
            type: data.data.type,
            message: data.data.message,
            image: data.data.image,
            timestamp: new Date(data.data.createdAt),
            confidence: data.data.confidence,
          };
          setAlert(alertData);
        } else {
          console.error("Alert not found");
        }
      } catch (error) {
        console.error("Error fetching alert:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAlert();
  }, [params.id]);

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "person":
        return <User className="h-6 w-6" />;
      case "animal":
        return <Dog className="h-6 w-6" />;
      default:
        return <AlertTriangle className="h-6 w-6" />;
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
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const handleDownload = () => {
    if (alert?.image) {
      const link = document.createElement("a");
      link.href = alert.image;
      link.download = `alert-${alert.id}-${
        alert.timestamp.toISOString().split("T")[0]
      }.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleShare = async () => {
    if (navigator.share && alert) {
      try {
        await navigator.share({
          title: `Drone Alert: ${alert.message}`,
          text: `Alert detected at ${formatTimestamp(alert.timestamp)}`,
          url: window.location.href,
        });
      } catch (error) {
        console.error("Error sharing:", error);
      }
    } else {
      // Fallback: copy URL to clipboard
      navigator.clipboard.writeText(window.location.href);
      // You could show a toast notification here
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-300 rounded w-1/4 mb-6"></div>
            <div className="bg-white rounded-lg p-6">
              <div className="h-6 bg-gray-300 rounded w-1/2 mb-4"></div>
              <div className="h-96 bg-gray-300 rounded mb-4"></div>
              <div className="h-4 bg-gray-300 rounded w-3/4"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!alert) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <Card>
            <CardContent className="text-center py-12">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h2 className="text-xl font-semibold mb-2">Alert Not Found</h2>
              <p className="text-gray-600">
                The requested alert could not be found or may have been deleted.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          {/* <Button
            variant="ghost"
            onClick={() => router.back()}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </Button> */}
          <div className="flex items-center space-x-2">
            {/* <Button variant="outline" size="sm" onClick={handleShare}>
              <Share className="h-4 w-4 mr-2" />
              Share
            </Button> */}
          </div>
        </div>

        {/* Alert Details Card */}
        <Card className={`border-l-4 ${getAlertColor(alert.type)}`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {getAlertIcon(alert.type)}
                <div>
                  <CardTitle className="text-2xl">{alert.message}</CardTitle>
                  <CardDescription className="text-base mt-1 text-gray-100">
                    Alert ID: {alert.id}
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-col justify-center items-center space-x-2">
                <Badge
                  variant={alert.type === "person" ? "destructive" : "default"}
                  className="text-sm px-3 py-1"
                >
                  {alert.type.charAt(0).toUpperCase() + alert.type.slice(1)}{" "}
                  Detection
                </Badge>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Image Display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Camera className="h-5 w-5" />
              <span>Detection Image</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative w-full h-96 md:h-[500px] lg:h-[600px] bg-gray-100 rounded-lg overflow-hidden">
              <Image
                src={alert.image || "/placeholder.svg"}
                alt="Alert Detection"
                fill
                className="object-contain"
                priority
              />
            </div>
          </CardContent>
        </Card>

        {/* Alert Information */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5" />
                <span>Timestamp</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-mono">
                {formatTimestamp(alert.timestamp)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5" />
                <span>Detection Details</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Type:</span>
                <Badge variant="outline">
                  {alert.type.charAt(0).toUpperCase() + alert.type.slice(1)}
                </Badge>
              </div>
              {alert.confidence && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Confidence:</span>
                  <Badge variant="secondary">{alert.confidence}%</Badge>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <Badge variant="outline" className="text-green-600">
                  Processed
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
