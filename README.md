# Domo User Management - Bulk Update Ownership of All Objects and Delete User

This repository contains a Code Engine function and Workflow that allows Domo administrators to bulk update the ownership of all objects owned by a specific user to a new owner, and then delete the original user from the Domo instance.

## How to Use

1. Copy the code from `main.js` into a new Code Engine package in your Domo instance.
2. Configure the two DataSet ID variables at the top of the code for the log and scheduled reports:
3. Log DataSet: Can just be a webform DataSet, with the following columns (in order): `userId`, `newOwnerId`, `type`, `id`, `date`, `status`, `notes`.
4. Scheduled Reports DataSet: This is the DomoStats Scheduled Reports DataSet that contains the list of scheduled reports in your instance. There isn't a good API endpoint to get this information, so we use this DataSet as a source of truth.
5. Deploy the Code Engine package.
6. Create a Workflow using the deployed Code Engine package and a trigger of your choice. You can use the Workflow definition in the workflow.json file in this repo as reference.
7. The Code Engine function transferContent requires two input parameters:
8. `userId`: The user ID of the user whose objects you want to reassign and who you want to delete.
9. `newOwnerId`: The user ID of the user who will become the new owner of the objects.
10. If you used the provided Workflow definition, make sure you update the admin email address in the final step of the flow and the card IDs for the links in both of the email steps. You can remove the email ServiceNow step as this is specific to Domo's internal processes. You can also customize the email content as needed or remove the email steps entirely if you don't need them.
11. Save and deploy the Workflow.
