# Mars Habitat Designer - Deployment Guide for Render

This guide provides step-by-step instructions for deploying your AI-powered Mars Habitat Designer application on Render.

## Prerequisites

1.  **A GitHub Account:** Your project code should be in a GitHub repository.
2.  **A Render Account:** Sign up for a free account at [render.com](https://render.com).
3.  **OpenAI API Key:** Have your `OPENAI_API_KEY` ready.

## Deployment Steps

1.  **Create a New Web Service:**
    *   Log in to your Render dashboard.
    *   Click the **"New +"** button and select **"Web Service"**.

2.  **Connect Your Repository:**
    *   Connect your GitHub account to Render.
    *   Select the GitHub repository for this project.

3.  **Configure the Service:**
    *   **Name:** Give your service a unique name (e.g., `mars-habitat-designer`).
    *   **Region:** Choose a region close to you.
    *   **Branch:** Select the main branch of your repository (e.g., `main` or `master`).
    *   **Root Directory:** Leave this blank if your `package.json` is in the root, otherwise specify the correct path.
    *   **Runtime:** Render should automatically detect **Node**.
    *   **Build Command:** `npm install`
    *   **Start Command:** `node server.js`
    *   **Instance Type:** Select the **Free** plan.

4.  **Add Environment Variables:**
    *   Under the "Advanced" section, click **"Add Environment Variable"**.
    *   Create one variable:
        *   **Key:** `OPENAI_API_KEY`
        *   **Value:** Paste your actual OpenAI API key here.

5.  **Create Web Service:**
    *   Click the **"Create Web Service"** button at the bottom of the page.

Render will now pull your code from GitHub, install the dependencies using the build command, and start the server using the start command.

You can monitor the deployment progress in the **"Events"** and **"Logs"** tabs for your service. Once the deployment is complete, Render will provide you with a public URL (e.g., `https-your-app-name.onrender.com`) where you can access your live application. The style boxes and all other features should now work perfectly. 