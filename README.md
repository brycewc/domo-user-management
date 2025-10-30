# Domo User Management - Bulk Update Ownership of All Objects and Delete User

This repository contains a Code Engine function and Workflow that allows Domo administrators to bulk update the ownership of all objects owned by a specific user to a new owner, and then delete the original user from the Domo instance.

## Examples

There are deployed examples of this Code Engine package and Workflow in the Domo Community instance:

- [Code Engine Package Example](https://domo-community.domo.com/codeengine/492e45d9-44a5-4601-ae05-91cb8cc4bf4e)
- [Workflow Example](https://domo-community.domo.com/workflows/models/f8a5dd51-fc5e-4e99-9149-679435d26cd2/1.0.1?_wfv=view)

## How to Use

1. Copy the code from `main.js` into a new Code Engine package in your Domo instance.
2. Configure the two DataSet ID variables at the top of the code for the log and scheduled reports:
   1. **Log DataSet**: Can just be a webform DataSet, with the following columns (in order): `userId`, `newOwnerId`, `type`, `id`, `date`, `status`, `notes`.
   2. **Scheduled Reports DataSet**: This is the DomoStats Scheduled Reports DataSet that contains the list of scheduled reports in your instance. There isn't a good API endpoint to get this information, so we use this DataSet as a source of truth.
3. Deploy the Code Engine package.
4. Create a Workflow using the deployed Code Engine package and a trigger of your choice. You can use the Workflow definition in the community instance as reference.
5. The Code Engine function transferContent requires two input parameters:
   1. `userId`: The user ID of the user whose objects you want to reassign and who you want to delete.
   2. `newOwnerId`: The user ID of the user who will become the new owner of the objects.
6. If you used the example Workflow from the community instance, update the email step as desired.
7. Save and deploy the Workflow.

## Supported Object Types

The function currently supports the following Domo object types for ownership reassignment:

- Accounts
- AI Models
- AI Projects
- Alerts
- App Studio Apps
- AppDB Collections
- Approval Templates
- Cards
- Code Engine Packages
- Custom Apps
- DataFlows
- DataSets
- Domo Everywhere Subscriptions
- FileSets
- Functions (Beast Modes and Variables)
- Goals
- Groups
- Jupyter Workspaces
- Metrics (Automated Insights)
- Pages
- Pending Approvals
- Projects and Tasks
- Sandbox Repositories
- Scheduled Reports _(using DomoStats DataSet)_
- Task Center Queues
- Task Center Tasks
- Workflows

## Unsupported Object Types

- Domo Everywhere Publications (still gets logged but not reassigned)
- Sent Back Approvals (still gets logged but not reassigned)
