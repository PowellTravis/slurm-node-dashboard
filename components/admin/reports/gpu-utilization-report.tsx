"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Define types for job and node data
interface JobData {
  job_id: string;
  user: string;
  account: string;
  gpus: number;
  nodes: string[];
  state: string;
  time_limit: number;
  time_used: number;
}

interface NodeGpuUtilization {
  node: string;
  gpus: Array<{
    gpu: string;
    modelName: string;
    utilization: number;
  }>;
  jobs: JobData[];
}

interface GpuJobUtilization {
  jobId: string;
  jobName?: string;
  user: string;
  avgUtilization: number;
  gpuCount: number;
  duration: number;
  nodeNames: string[];
}

interface GpuUtilizationReportProps {
  data?: any;
}

const COLORS = ["#2563eb", "#4f46e5", "#7c3aed", "#c026d3", "#db2777"];
const UNDERUTILIZATION_THRESHOLD = 30; // Below 30% is considered underutilized

const GpuUtilizationReport: React.FC<GpuUtilizationReportProps> = ({
  data,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [nodesWithGpus, setNodesWithGpus] = useState<string[]>([]);
  const [nodeUtilizationData, setNodeUtilizationData] = useState<
    NodeGpuUtilization[]
  >([]);
  const [jobUtilizationData, setJobUtilizationData] = useState<
    GpuJobUtilization[]
  >([]);
  const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);
  const [utilizationRanges, setUtilizationRanges] = useState([
    { name: "0-20%", value: 0 },
    { name: "21-40%", value: 0 },
    { name: "41-60%", value: 0 },
    { name: "61-80%", value: 0 },
    { name: "81-100%", value: 0 },
  ]);
  const [summaryStats, setSummaryStats] = useState({
    totalJobs: 0,
    underutilizedJobs: 0,
    averageUtilization: 0,
    wastedGpuHours: 0,
  });

  // Function to fetch all nodes with GPUs - memoized to improve performance
  const fetchNodesWithGpus = useCallback(async () => {
    try {
      const response = await fetch("/api/slurm/nodes");
      const data = await response.json();

      // Filter nodes that have GPUs (looking for GRES or gres field that contains "gpu")
      const gpuNodes = data.nodes.filter((node: any) => {
        const gresString = node.gres || node.GRES || "";
        return gresString.toLowerCase().includes("gpu");
      });

      return gpuNodes.map((node: any) => node.name);
    } catch (error) {
      console.error("Error fetching nodes with GPUs:", error);
      return [];
    }
  }, []);

  // Function to fetch GPU utilization data for a specific node
  const fetchNodeGpuUtilization = useCallback(
    async (nodeName: string): Promise<NodeGpuUtilization | null> => {
      try {
        // Fetch GPU utilization from Prometheus
        const gpuResponse = await fetch(
          `/api/prometheus/dcgm?node=${encodeURIComponent(nodeName)}`
        );
        const gpuData = await gpuResponse.json();

        if (
          gpuData.status !== 200 ||
          !gpuData.data ||
          gpuData.data.length === 0
        ) {
          return null;
        }

        // Fetch jobs running on this node
        const jobsResponse = await fetch(`/api/slurm/jobs/node/${nodeName}`);
        const jobsData = await jobsResponse.json();

        const jobs = jobsData.jobs || [];

        // Process GPU data to extract utilization values correctly with more robust extraction
        const processedGpus = gpuData.data.map((gpu: any) => {
          // More robust extraction function that handles different data formats
          const extractUtilization = (gpuData: any): number => {
            if (
              !gpuData.values ||
              !Array.isArray(gpuData.values) ||
              gpuData.values.length === 0
            ) {
              return 0;
            }

            const firstValue = gpuData.values[0];

            if (typeof firstValue === "number") {
              return firstValue;
            } else if (typeof firstValue === "object") {
              if (firstValue.value !== undefined) {
                return parseFloat(firstValue.value);
              } else if (firstValue.time && firstValue.value !== undefined) {
                return parseFloat(firstValue.value);
              }
            }

            return 0;
          };

          const utilization = extractUtilization(gpu);

          // Log for debugging
          console.log(
            `GPU ${gpu.gpu} (${gpu.modelName || "Unknown"}): ${utilization}%`
          );

          return {
            gpu: gpu.gpu,
            modelName: gpu.modelName || "Unknown",
            utilization: isNaN(utilization) ? 0 : utilization,
          };
        });

        return {
          node: nodeName,
          gpus: processedGpus,
          jobs: jobs,
        };
      } catch (error) {
        console.error(`Error fetching data for node ${nodeName}:`, error);
        return null;
      }
    },
    []
  );

  // Function to combine GPU utilization and job data to get job-level GPU utilization
  const processJobUtilization = useCallback(
    (nodeData: NodeGpuUtilization[]): GpuJobUtilization[] => {
      const jobMap = new Map<string, GpuJobUtilization>();

      // Process each node's data
      nodeData.forEach((node) => {
        // Get valid GPUs for this node (with numerical utilization values)
        const validGpus = node.gpus.filter((gpu) => !isNaN(gpu.utilization));

        // Calculate average GPU utilization for this node
        const totalUtilization = validGpus.reduce(
          (acc, gpu) => acc + gpu.utilization,
          0
        );
        const avgNodeUtilization =
          validGpus.length > 0 ? totalUtilization / validGpus.length : 0;

        console.log(`Node ${node.node} avg utilization:`, avgNodeUtilization);

        // Process each job running on this node
        node.jobs.forEach((job) => {
          const jobId = job.job_id;

          if (!jobMap.has(jobId)) {
            // First time seeing this job
            jobMap.set(jobId, {
              jobId,
              user: job.user,
              avgUtilization: avgNodeUtilization,
              gpuCount: job.gpus || 0,
              duration: job.time_used || 0,
              nodeNames: [node.node],
            });
          } else {
            // Update existing job data
            const existingJob = jobMap.get(jobId)!;

            // Only update utilization if we have valid GPU data
            if (validGpus.length > 0) {
              const totalUtil =
                existingJob.avgUtilization * existingJob.nodeNames.length;
              const newAvgUtil =
                (totalUtil + avgNodeUtilization) /
                (existingJob.nodeNames.length + 1);
              existingJob.avgUtilization = newAvgUtil;
            }

            // Add this node to the list of nodes for this job
            if (!existingJob.nodeNames.includes(node.node)) {
              existingJob.nodeNames.push(node.node);
            }

            // Update job with new values
            jobMap.set(jobId, existingJob);
          }
        });
      });

      return Array.from(jobMap.values());
    },
    []
  );

  // Function to generate time series data from node utilization - only include real data
  const generateTimeSeriesData = useCallback(
    (nodeData: NodeGpuUtilization[]): any[] => {
      // Calc current time for timestamp
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const formattedTime = `${currentHour}:${
        currentMinute < 10 ? "0" + currentMinute : currentMinute
      }`;

      // Filter out any nodes without gpus or with non-numeric utilization data
      const validGpus = nodeData
        .flatMap((node) => node.gpus)
        .filter((gpu) => !isNaN(gpu.utilization));

      // Calculate average utilization across all nodes for current time
      const totalUtilization = validGpus.reduce((acc, gpu) => {
        return acc + gpu.utilization;
      }, 0);

      const avgUtilization =
        validGpus.length > 0 ? totalUtilization / validGpus.length : 0;

      // Log for debugging
      console.log("Valid GPUs found:", validGpus.length);
      console.log("Total utilization:", totalUtilization);
      console.log("Average utilization:", avgUtilization);

      // Return only current real data point
      return [
        {
          timestamp: formattedTime,
          averageUtilization: Math.round(avgUtilization),
          isRealData: true,
        },
      ];
    },
    []
  );

  // Function to calculate utilization ranges and summary statistics
  const calculateStats = useCallback((jobData: GpuJobUtilization[]) => {
    // Calculate utilization ranges
    const ranges = [
      { name: "0-20%", value: 0 },
      { name: "21-40%", value: 0 },
      { name: "41-60%", value: 0 },
      { name: "61-80%", value: 0 },
      { name: "81-100%", value: 0 },
    ];

    jobData.forEach((job) => {
      if (job.avgUtilization <= 20) ranges[0].value++;
      else if (job.avgUtilization <= 40) ranges[1].value++;
      else if (job.avgUtilization <= 60) ranges[2].value++;
      else if (job.avgUtilization <= 80) ranges[3].value++;
      else ranges[4].value++;
    });

    // Calculate summary statistics
    const totalJobs = jobData.length;
    const underutilizedJobs = jobData.filter(
      (job) => job.avgUtilization < UNDERUTILIZATION_THRESHOLD
    ).length;
    const averageUtilization =
      totalJobs > 0
        ? jobData.reduce((acc, job) => acc + job.avgUtilization, 0) / totalJobs
        : 0;

    // Calculate wasted GPU hours (assuming low utilization = wasted resources)
    const wastedGpuHours = jobData.reduce((acc, job) => {
      const utilization = job.avgUtilization / 100;
      const wastedFraction = 1 - utilization;
      // Convert job duration to hours (assuming it's in minutes)
      const durationHours = job.duration / 60;
      return acc + wastedFraction * job.gpuCount * durationHours;
    }, 0);

    setUtilizationRanges(ranges);
    setSummaryStats({
      totalJobs,
      underutilizedJobs,
      averageUtilization: parseFloat(averageUtilization.toFixed(1)),
      wastedGpuHours: Math.round(wastedGpuHours),
    });
  }, []);

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Get all nodes with GPUs
      const gpuNodes = await fetchNodesWithGpus();
      setNodesWithGpus(gpuNodes);

      // 2. Use Promise.all to fetch data for all nodes in parallel
      const nodeDataPromises = gpuNodes.map((node: string) =>
        fetchNodeGpuUtilization(node)
      );
      const nodeDataResults = await Promise.all(nodeDataPromises);

      // 3. Filter out null results
      const validNodeData = nodeDataResults.filter(
        (data): data is NodeGpuUtilization => data !== null
      );
      setNodeUtilizationData(validNodeData);

      // 4. Process job utilization data
      const jobUtilization = processJobUtilization(validNodeData);
      setJobUtilizationData(jobUtilization);

      // 5. Generate time series data (only real data now)
      const timeData = generateTimeSeriesData(validNodeData);
      setTimeSeriesData(timeData);

      // 6. Calculate statistics
      calculateStats(jobUtilization);
    } catch (error) {
      console.error("Error loading GPU utilization data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [
    fetchNodesWithGpus,
    fetchNodeGpuUtilization,
    processJobUtilization,
    generateTimeSeriesData,
    calculateStats,
  ]);

  // Load data on initial render
  useEffect(() => {
    loadAllData();
    // No auto-refresh interval as requested
  }, [loadAllData]);

  // Find underutilized jobs (all of them, not just top 5)
  const underutilizedJobs = jobUtilizationData
    .filter((job) => job.avgUtilization < UNDERUTILIZATION_THRESHOLD)
    .sort((a, b) => a.avgUtilization - b.avgUtilization);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold mb-2">
            GPU Utilization Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">
            Monitoring {nodesWithGpus.length} nodes with{" "}
            {jobUtilizationData.length} GPU jobs
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadAllData}
          className="flex items-center gap-1"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{summaryStats.totalJobs}</div>
            <p className="text-sm text-muted-foreground">GPU Jobs Running</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {summaryStats.underutilizedJobs}
            </div>
            <p className="text-sm text-muted-foreground">Underutilized Jobs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {summaryStats.averageUtilization}%
            </div>
            <p className="text-sm text-muted-foreground">Avg GPU Utilization</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {summaryStats.wastedGpuHours}
            </div>
            <p className="text-sm text-muted-foreground">Wasted GPU Hours</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Visualizations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Average GPU Utilization - Current Only */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-medium mb-4">
              Current Average GPU Utilization
            </h3>
            {timeSeriesData.length > 0 ? (
              <div className="flex flex-col items-center justify-center h-64">
                <div className="text-6xl font-bold text-primary">
                  {timeSeriesData[0].averageUtilization}%
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  Last updated: {timeSeriesData[0].timestamp}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">No data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Distribution of GPU Utilization */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-medium mb-4">
              GPU Utilization Distribution
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={utilizationRanges}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) =>
                    percent > 0 ? `${name}: ${(percent * 100).toFixed(0)}%` : ""
                  }
                >
                  {utilizationRanges.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value} jobs`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Underutilized Jobs Alert */}
      {underutilizedJobs.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Underutilized GPU Jobs Detected</AlertTitle>
          <AlertDescription>
            {underutilizedJobs.length} jobs were found with GPU utilization
            below {UNDERUTILIZATION_THRESHOLD}%. This may indicate inefficient
            resource usage or jobs that are waiting for data/processing.
          </AlertDescription>
        </Alert>
      )}

      {/* Node-by-Node GPU Utilization */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-medium mb-4">Node GPU Utilization</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {nodeUtilizationData.map((node) => {
              const avgUtilization =
                node.gpus.length > 0
                  ? node.gpus.reduce((acc, gpu) => acc + gpu.utilization, 0) /
                    node.gpus.length
                  : 0;

              let utilizationClass = "text-green-500";
              if (avgUtilization < 30) utilizationClass = "text-red-500";
              else if (avgUtilization < 60)
                utilizationClass = "text-yellow-500";

              return (
                <Card key={node.node} className="bg-muted/20">
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-medium">{node.node}</h4>
                        <p className="text-xs text-muted-foreground">
                          {node.gpus.length} GPUs, {node.jobs.length} Jobs
                        </p>
                      </div>
                      <div
                        className={`text-lg font-semibold ${utilizationClass}`}
                      >
                        {avgUtilization.toFixed(1)}%
                      </div>
                    </div>

                    {node.gpus.map((gpu, i) => (
                      <div key={i} className="mt-2">
                        <div className="flex justify-between items-center text-xs mb-1">
                          <span>
                            GPU {gpu.gpu} ({gpu.modelName})
                          </span>
                          <span>{gpu.utilization.toFixed(1)}%</span>
                        </div>
                        <div className="h-1 w-full bg-secondary rounded-full">
                          <div
                            className="h-1 bg-primary rounded-full"
                            style={{ width: `${gpu.utilization}%` }}
                          />
                        </div>
                      </div>
                    ))}

                    {node.jobs.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-border">
                        <div className="text-xs font-medium mb-1">
                          Running Jobs:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {node.jobs.map((job) => (
                            <Badge key={job.job_id} variant="secondary">
                              {job.job_id}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Underutilized Jobs Table - Replaced Chart with Table */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-medium mb-4">Underutilized Jobs</h3>
          {underutilizedJobs.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job ID</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Utilization</TableHead>
                    <TableHead className="text-right">GPUs</TableHead>
                    <TableHead className="text-right">Duration (hrs)</TableHead>
                    <TableHead>Nodes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {underutilizedJobs.map((job) => (
                    <TableRow key={job.jobId}>
                      <TableCell className="font-medium">{job.jobId}</TableCell>
                      <TableCell>{job.user}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            job.avgUtilization < 10
                              ? "text-red-500 font-semibold"
                              : "text-amber-500"
                          }
                        >
                          {job.avgUtilization.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {job.gpuCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {(job.duration / 60).toFixed(1)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {job.nodeNames.join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 bg-muted/20 rounded-md">
              <p className="text-muted-foreground">
                No underutilized jobs detected.
              </p>
            </div>
          )}
          <div className="mt-4 text-sm text-muted-foreground">
            * Showing jobs with utilization below {UNDERUTILIZATION_THRESHOLD}%
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GpuUtilizationReport;
