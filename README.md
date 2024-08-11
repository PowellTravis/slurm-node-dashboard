# HPC Dashboard

This repository contains the source code for the HPC Dashboard, a Next.js application designed to monitor the status of SLURM nodes. The dashboard provides total utilization metrics for CPU and GPU nodes, as well as detailed statuses for individual nodes. This application is built using well known packages, and styled with tailwindcss and Shadcn components

## Standard Features

- View total utilization of CPU and GPU nodes.
- Individual node status with details on CPU, GPU, and memory usage.
- View Slurm job details.

## Optional Features

The optional features will be enabled by adding the detailst to the environments file. If these are left blank, the intergration will not show up, but the rest of the application will continue to function correctly.

- LMOD module details
- Prometheus integration
- InfluxDB intergration
- OpenAI intergration

## Prerequisites

Before you begin, ensure you have the following installed:

- Node.js (v18 or later)
- Yarn or npm
- Slurm API enabled on your HPC cluster
- Slurm API token for authentication

## Getting Started

To get a local copy up and running, follow these simple steps.

### Clone the repository

```bash
git clone https://github.com/thediymaker/slurm-node-dashboard.git
cd slurm-node-dashboard
```

### Install dependencies

```
npm install
```

```
dnf install pm2
or
apt install pm2
```

### Run the application with PM2

```
pm2 start npm --name "slurm-node-dashboard" -- start
```

The application should now be running on [http://localhost:3000](http://localhost:3000).

## Environment Variables

To run this project, you will need to add the following environment variables to your `.env` file.

```plaintext
COMPANY_NAME=""
URL=""
NEXT_PUBLIC_APP_URL=""
CLUSTER_NAME=""
CLUSTER_LOGO="/logo.png"

NEXT_PUBLIC_CLUSTER_NAME=""

PROMETHEUS_URL=""
INFLUX_TOKEN=""
INFLUX_URL=""
INFLUX_ORG=""

OPENAI_API_KEY=""

NODE_ENV="production"
REACT_EDITOR="code"

SLURM_API_VERSION="v0.0.40"
SLURM_SERVER=""
SLURM_API_TOKEN=""
```

**You will also need to make sure you place your logo.png in the plublic directory, as well as replace the default favicon.ico with your own.**

## Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Distributed under the GNU License. See `LICENSE.md` for more information.

## Contact

Your Name – [john.lee@thediymaker.com](mailto:john.lee@thediymaker.com)

Project Link: [https://github.com/thediymaker/slurm-node-dashboard](https://github.com/thediymaker/slurm-node-dashboard)

## Screenshots

### Basic Dashboard

![Dashboard Screenshot](/images/basic_screenshot.png "Basic Dashboard")

### Dashboard Features

![Dashboard Hover Screenshot](/images/features_screenshot.png "Features")

### Job Detail

![Dashboard Footer Screenshot](/images/job_detail_screenshot.png "Job Detail")

### Node Detail

![Dashboard Footer Screenshot](/images/node_job_details_screenshot.png "Basic Job Detail")

### Dashboard

![Dashboard Screenshot](/images/dashboard_screenshot_1.png "Dashboard Overview")

### Dashboard Hover

![Dashboard Hover Screenshot](/images/dashboard_screenshot_2.png "Hover Status")

### Dashboard Footer

![Dashboard Footer Screenshot](/images/dashboard_screenshot_3.png "Footer")
