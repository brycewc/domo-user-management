/* eslint require-atomic-updates: 0 */
const codeengine = require('codeengine');

class Helpers {
	/**
	 * Helper function to handle API requests and errors
	 * @param {text} method - The HTTP method
	 * @param {text} url - The endpoint URL
	 * @param {Object} [body=null] - The request body
	 * @param {Object} [headers=null] - The request headers
	 * @param {text} [content='application/json'] - Request body content type
	 * @returns {Object} The response data
	 * @throws {Error} If the request fails
	 */
	static async handleRequest(
		method,
		url,
		body = null,
		headers = null,
		contentType = 'application/json'
	) {
		try {
			if (method.toUpperCase() === 'GET') {
				return await codeengine.sendRequest(method, url);
			} else {
				return await codeengine.sendRequest(
					method,
					url,
					body,
					headers,
					contentType
				);
			}
		} catch (error) {
			console.error(`Error with ${method} request to ${url}:`, error);
			throw error;
		}
	}
}

const { handleRequest } = Helpers;

async function getUserManager(userId) {
	const url = `/api/identity/v1/users/${userId}?parts=DETAILED`;
	const response = await handleRequest('GET', url);
	var user = response.users[0];
	user.attributes.forEach((attribute) => {
		const key = attribute.key;
		const value = attribute.values[0]; // Assuming values array always has one element
		user[key] = value;
	});
	delete user.attributes;
	delete user.role;
	if (!user.reportsTo) {
		const queryResponse = await handleRequest(
			'POST',
			'api/query/v1/execute/87276a1f-12ff-4008-904f-874966e618fa'
		); // Output: Domo Users (domo.domo) |PROD| - https://domo.domo.com/datasources/87276a1f-12ff-4008-904f-874966e618fa/details/data/table
		user.reportsTo = queryResponse[0]['HRIS Manager Domo ID'];
	}
	return user.reportsTo;
}

async function getUserName(userId) {
	const url = `/api/content/v3/users/${userId}`;
	const user = await handleRequest('GET', url);
	return user.displayName || null;
}

/**
 * Retrieve all active sessions and delete those belonging to the specified user.
 *
 * @param {string} userId - The Domo user ID for which to delete active sessions.
 * @returns {Promise<void>} Resolves when all user's sessions are deleted or rejects on error.
 */
async function deleteUserSessions(userId) {
	const url = '/api/sessions/v1/admin?limit=99999999';
	// Fetch all sessions (potentially large number depending on 'limit')
	const response = await handleRequest('GET', url);

	// Find sessions assigned to the specified user
	const sessionsToDelete = response.filter((s) => s.userId === userId);
	if (sessionsToDelete.length > 0) {
		// Delete all sessions concurrently and wait for completion
		await Promise.all(sessionsToDelete.map((s) => deleteSession(s.id)));
	}
}

/**
 * Delete a session by its session ID.
 *
 * @param {string} sessionId - The ID of the session to delete.
 * @returns {Promise<void>} Resolves after session deletion, or logs error if deletion fails.
 */
async function deleteSession(sessionId) {
	const url = `api/sessions/v1/admin/${sessionId}`;

	await handleRequest('DELETE', url);
}

/**
 * Delete a user by its ID.
 *
 * @param {string} userId - The ID of the user to delete.
 * @returns {Promise<void>} Resolves after session deletion, or logs error if deletion fails.
 */
async function deleteUser(userId) {
	const url = `/api/identity/v1/users/${userId}`;

	await handleRequest('DELETE', url);
}

async function appendToDataset(
	csvValues,
	datasetId = '83dec9f2-206b-445a-90ea-b6a368b3157d' // https://domo.domo.com/datasources/83dec9f2-206b-445a-90ea-b6a368b3157d/details/data/table
) {
	const uploadUrl = `api/data/v3/datasources/${datasetId}/uploads`;
	const uploadBody = {
		action: 'APPEND',
		message: 'Uploading',
		appendId: 'latest'
	};
	// Start upload session
	const { uploadId } = await handleRequest('POST', uploadUrl, uploadBody);

	// Upload data part
	const partsUrl = uploadUrl + `/${uploadId}/parts/1`;
	//const partsUrl = UPLOADS_PARTS_URL.replace(':id', dataset).replace(':uploadId', uploadId);
	await handleRequest('PUT', partsUrl, csvValues, null, 'text/csv');

	// Commit upload
	const commitUrl = uploadUrl + `/${uploadId}/commit`;
	//const commitUrl = UPLOADS_COMMIT_URL.replace(':id', dataset).replace(':uploadId', uploadId);
	const commitBody = {
		index: true,
		appendId: 'latest',
		message: 'Append successful'
	};

	return await handleRequest('PUT', commitUrl, commitBody);
}

async function logTransfers(
	userId,
	newOwnerId,
	type,
	ids,
	status = 'TRANSFERRED',
	notes = null
) {
	const BATCH_SIZE = 50;
	let batch = [];
	const date = new Date().toISOString().slice(0, -5); // Format: YYYY-MM-DDTHH:mm:ss

	for (const id of ids) {
		batch.push(
			`${userId},${newOwnerId},${type},${id},${date},${status},${notes}`
		);

		if (batch.length >= BATCH_SIZE) {
			try {
				await appendToDataset(
					batch.join('\n') + '\n',
					'83dec9f2-206b-445a-90ea-b6a368b3157d' // https://domo.domo.com/datasources/83dec9f2-206b-445a-90ea-b6a368b3157d/details/data/table
				);
			} catch (error) {
				console.error('Logging failed:', error);
			}
			batch = [];
		}
	}

	if (batch.length > 0) {
		try {
			await appendToDataset(
				batch.join('\n') + '\n',
				'83dec9f2-206b-445a-90ea-b6a368b3157d' // https://domo.domo.com/datasources/83dec9f2-206b-445a-90ea-b6a368b3157d/details/data/table
			);
		} catch (error) {
			console.error('Logging failed:', error);
		}
	}
}

//---------------------------TRANSFER-----------------------//

async function transferContent(userId, newOwnerId) {
	await Promise.all([
		transferDatasets(userId, newOwnerId),

		transferDataflows(userId, newOwnerId),

		transferCards(userId, newOwnerId),

		transferAlerts(userId, newOwnerId),

		transferWorkflows(userId, newOwnerId),

		transferTaskCenterTasks(userId, newOwnerId),

		transferAppStudioApps(userId, newOwnerId),

		transferPages(userId, newOwnerId),

		transferScheduledReports(userId, newOwnerId),

		transferGoals(userId, newOwnerId, getCurrentPeriod()),

		transferGroups(userId, newOwnerId),

		transferAppDbCollections(userId, newOwnerId),

		transferFunctions(userId, newOwnerId),

		transferAccounts(userId, newOwnerId),

		transferJupyterWorkspaces(userId, newOwnerId),

		transferCodeEnginePackages(userId, newOwnerId),

		transferFilesets(userId, newOwnerId),

		getPublications(userId, newOwnerId),

		transferSubscriptions(userId, newOwnerId),

		transferRepositories(userId, newOwnerId),

		transferApprovals(userId, newOwnerId),

		transferCustomApps(userId, newOwnerId),

		transferAiModels(userId, newOwnerId),

		transferAiProjects(userId, newOwnerId),

		transferProjectsAndTasks(userId, newOwnerId)
	]);
}

//-------------------------DataSets--------------------------//

async function transferDatasets(userId, newOwnerId) {
	let offset = 0;
	const count = 100;
	let moreData = true;
	const datasets = [];

	while (moreData) {
		const data = {
			entities: ['DATASET'],
			filters: [
				{
					field: 'owned_by_id',
					filterType: 'term',
					value: userId
				}
			],
			combineResults: true,
			query: '*',
			count: count,
			offset: offset,
			sort: {
				isRelevance: false,
				fieldSorts: [{ field: 'create_date', sortOrder: 'DESC' }]
			}
		};

		const response = await handleRequest(
			'POST',
			'/api/data/ui/v3/datasources/search',
			data
		);

		if (response.dataSources && response.dataSources.length > 0) {
			// Extract ids and append to list
			const ids = response.dataSources.map((dataset) => dataset.id);
			datasets.push(...response.dataSources);

			// Increment offset to get next page
			offset += count;

			// If less than pageSize returned, this is the last page
			if (response.dataSources.length < count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}

	const body = {
		responsibleUserId: newOwnerId
	};

	const userName = await getUserName(userId);

	for (let i = 0; i < datasets.length; i++) {
		const endpoint = `/api/data/v2/datasources/${datasets[i].id}/responsibleUsers`;
		await handleRequest('PUT', endpoint, body);
		let tags = datasets[i].tagList || [];
		if (tags.length > 0) {
			tags = datasets[i].tagsList.filter((tag) => !tag.startsWith('From'));
		}
		tags.push(`From ${userName}`);
		const tagsUrl = `/api/data/ui/v3/datasources/${datasets[i].id}/tags`;
		await handleRequest('POST', tagsUrl, tags);
	}

	await logTransfers(
		userId,
		newOwnerId,
		'DATA_SOURCE',
		datasets.map((ds) => ds.id)
	);
}

//----------------------------DataFlows-----------------------//

async function transferDataflows(userId, newOwnerId) {
	const userName = await getUserName(userId);
	const count = 100;
	let offset = 0;
	let moreData = true;

	while (moreData) {
		const data = {
			entities: ['DATAFLOW'],
			filters: [
				{
					field: 'owned_by_id',
					filterType: 'term',
					value: userId
				}
			],
			query: '*',
			count: count,
			offset: offset
		};

		const response = await handleRequest('POST', '/api/search/v1/query', data);
		//console.log(response.searchObjects);

		const url = '/api/dataprocessing/v1/dataflows/bulk/patch';
		if (response.searchObjects && response.searchObjects.length > 0) {
			// Extract ids and append to list
			const dataflows = response.searchObjects;
			const ids = dataflows.map((dataflow) => dataflow.databaseId);
			const tags = dataflows.tags || [];
			if (tags.length > 0) {
				const oldTags = tags.filter((tag) => tag.startsWith('From')) || [];

				// Remove tags
				if (oldTags.length > 0) {
					const removetagsBody = {
						dataFlowIds: ids,
						tagNames: oldTags
					};
					await handleRequest(
						'PUT',
						'/api/dataprocessing/v1/dataflows/bulk/tag/delete',
						removetagsBody
					);
				}
			}

			// Log transfers
			await logTransfers(userId, newOwnerId, 'DATAFLOW_TYPE', ids);

			// Update owner
			const body = {
				dataFlowIds: ids,
				responsibleUserId: newOwnerId
			};
			await handleRequest('PUT', url, body);

			// Add new tags
			const addTagsBody = {
				dataFlowIds: ids,
				tagNames: [`From ${userName}`]
			};
			await handleRequest(
				'PUT',
				'/api/dataprocessing/v1/dataflows/bulk/tag',
				addTagsBody
			);

			// Increment offset to get next page
			offset += count;

			// If less than pageSize returned, this is the last page
			if (response.searchObjects.length < count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
}

//----------------------Cards-------------------------//

async function transferCards(userId, newOwnerId) {
	const url = '/api/search/v1/query';

	let offset = 0;
	const count = 50;
	let moreData = true;

	while (moreData) {
		const data = {
			count: count,
			offset: offset,
			combineResults: false,
			query: '*',
			filters: [
				{
					name: 'OWNED_BY_ID',
					field: 'owned_by_id',
					facetType: 'user',
					value: `${userId}:USER`,
					filterType: 'term'
				}
			],
			entityList: [['card']]
		};

		const response = await handleRequest('POST', url, data);

		if (response.searchObjects && response.searchObjects.length > 0) {
			// Extract ids and append to list
			const ids = response.searchObjects.map((card) => card.databaseId);
			let body = {
				cardIds: ids,
				cardOwners: [
					{
						id: newOwnerId,
						type: 'USER'
					}
				],
				note: '',
				sendEmail: false
			};

			await handleRequest('POST', '/api/content/v1/cards/owners/add', body);

			body.cardOwners = [
				{
					id: userId,
					type: 'USER'
				}
			];

			await handleRequest('POST', '/api/content/v1/cards/owners/remove', body);

			await logTransfers(userId, newOwnerId, 'CARD', ids);

			// Increment offset to get next page
			offset += count;

			// If less than pageSize returned, this is the last page
			if (response.searchObjects.length < count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
}

// -----------------Alerts--------------------------//
/**
 * Get alerts a user is subscribed to
 *
 * @param {string} userId - The ID of the user to get alerts for.
 * @returns {List<int>} List of alert IDs the user is subscribed to.
 */
async function transferAlerts(userId, newOwnerId) {
	let moreData = true;
	let offset = 0;
	const limit = 50;
	let alerts = [];

	while (moreData) {
		const response = await handleRequest(
			'GET',
			`/api/social/v4/alerts?ownerId=${userId}&limit=${limit}&offset=${offset}`
		);

		if (response.length > 0) {
			// Extract ids and append to list
			const ids = response.map((alert) => alert.id);
			alerts.push(...ids);

			// Increment offset to get next page
			offset += limit;

			// If less than pageSize returned, this is the last page
			if (response.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}

	// const body = {
	// 	alertSubscriptions: [{ subscriberId: newOwnerId, type: 'USER' }],
	// 	sendEmail: false
	// };

	// for (let i = 0; i < alerts.length; i++) {
	// 	const url = `/api/social/v4/alerts/${alerts[i]}/share`;
	// 	await handleRequest('POST', url, body);
	// }

	for (let i = 0; i < alerts.length; i++) {
		const body = {
			id: alerts[i],
			owner: newOwnerId
		};
		const url = `/api/social/v4/alerts/${alerts[i]}`;
		await handleRequest('PATCH', url, body);
	}

	await logTransfers(userId, newOwnerId, 'ALERT', alerts);
}

//---------------------------Workflows--------------------------------//
/**
 * Get Workflows owned by given user ID
 *
 * @param {string} userId - The ID of the owner to search for.
 * @returns {Array<string>} List of workflow IDs owned by the user.
 */
async function transferWorkflows(userId, newOwnerId) {
	const count = 100;
	let offset = 0;
	let moreData = true;
	let workflows = [];

	while (moreData) {
		const data = {
			query: '*',
			entityList: [['workflow_model']],
			count: count,
			offset: offset,
			filters: [
				{
					facetType: 'user',
					filterType: 'term',
					field: 'owned_by_id',
					value: `${userId}:USER`
				}
			]
		};

		const response = await handleRequest('POST', '/api/search/v1/query', data);
		//console.log(response.searchObjects);

		if (response.searchObjects && response.searchObjects.length > 0) {
			// Extract ids and append to list
			const ids = response.searchObjects.map((workflow) => workflow.uuid);
			workflows.push(...ids);

			// Increment offset to get next page
			offset += count;

			// If less than pageSize returned, this is the last page
			if (response.searchObjects.length < count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}

	const body = { owner: newOwnerId };

	for (let i = 0; i < workflows.length; i++) {
		const url = `/api/workflow/v1/models/${workflows[i]}`;
		await handleRequest('PUT', url, body);
	}

	await logTransfers(userId, newOwnerId, 'WORKFLOW_MODEL', workflows);
}

//--------------------------Task Center Tasks--------------------------//

async function transferTaskCenterTasks(userId, newOwnerId) {
	let tasks = [];
	let offset = 0;
	const limit = 100;
	let moreData = true;

	while (moreData) {
		const response = await handleRequest(
			'POST',
			`/api/queues/v1/tasks/list?limit=${limit}&offset=${offset}`,
			{ assignedTo: [userId], status: ['OPEN'] }
		);

		if (response && response.length > 0) {
			// Extract ids and append to list
			const ids = response.map((task) => ({
				id: task.id,
				queueId: task.queueId
			}));
			tasks.push(...ids);

			// Increment offset to get next page
			offset += limit;

			// If less than pageSize returned, this is the last page
			if (response.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
	const taskIdList = [];

	for (let i = 0; i < tasks.length; i++) {
		const url = `/api/queues/v1/${tasks[i].queueId}/tasks/${tasks[i].id}/assign`;
		const body = { userId: newOwnerId, type: 'USER', taskIds: [tasks[i].id] };
		taskIdList.push(tasks[i].id);

		await handleRequest('PUT', url, body);
	}

	await logTransfers(userId, newOwnerId, 'HOPPER_TASK', taskIdList);
}

//------------------------------------App Studio--------------------------//

async function transferAppStudioApps(userId, newOwnerId) {
	const limit = 30;
	let skip = 0;
	let moreData = true;
	const data = {};

	while (moreData) {
		const url = `/api/content/v1/dataapps/adminsummary?limit=${limit}&skip=${skip}`;
		const response = await handleRequest('POST', url, data);

		if (
			response.dataAppAdminSummaries &&
			response.dataAppAdminSummaries.length > 0
		) {
			// Extract ids and append to list
			const apps = response.dataAppAdminSummaries
				.filter((item) => item.owners.some((owner) => owner.id == userId))
				.map((item) => item.dataAppId.toString());
			if (apps.length > 0) {
				const addBody = {
					note: '',
					entityIds: apps,
					owners: [{ type: 'USER', id: parseInt(newOwnerId) }],
					sendEmail: false
				};

				await handleRequest(
					'PUT',
					'/api/content/v1/dataapps/bulk/owners',
					addBody
				);

				const removeBody = {
					entityIds: apps,
					owners: [{ type: 'USER', id: userId }]
				};

				await handleRequest(
					'PUT',
					'/api/content/v1/dataapps/bulk/owners/remove',
					removeBody
				);

				await logTransfers(userId, newOwnerId, 'DATA_APP', apps);
			}
			// Increment offset to get next page
			skip += limit;

			// If less than pageSize returned, this is the last page
			if (response.dataAppAdminSummaries.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
}

//-----------------------------------Pages------------------------------//

async function transferPages(userId, newOwnerId) {
	const url = '/api/search/v1/query';
	let offset = 0;
	const count = 50;
	let moreData = true;

	while (moreData) {
		const data = {
			count: count,
			offset: offset,
			combineResults: false,
			query: '*',
			filters: [
				{
					name: 'OWNED_BY_ID',
					field: 'owned_by_id',
					facetType: 'user',
					value: `${userId}:USER`,
					filterType: 'term'
				}
			],
			entityList: [['page']]
		};

		const response = await handleRequest('POST', url, data);
		//console.log(response.searchObjects);

		if (response.searchObjects && response.searchObjects.length > 0) {
			// Extract ids and append to list
			const pages = response.searchObjects.map((page) => page.databaseId);

			for (let i = 0; i < pages.length; i++) {
				const body = {
					owners: [{ id: newOwnerId, type: 'USER' }],
					pageIds: pages
				};

				await handleRequest('PUT', '/api/content/v1/pages/bulk/owners', body);

				const removeBody = {
					owners: [
						{
							id: parseInt(userId),
							type: 'USER'
						}
					],
					pageIds: pages
				};

				await handleRequest(
					'POST',
					'/api/content/v1/pages/bulk/owners/remove',
					removeBody
				);
			}
			await logTransfers(userId, newOwnerId, 'PAGE', pages);
			// Increment offset to get next page
			offset += count;

			// If less than pageSize returned, this is the last page
			if (response.searchObjects.length < count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
}

//---------------------------------Scheduled Reports--------------------------------//

async function transferScheduledReports(userId, newOwnerId) {
	// Input: DomoStats Scheduled Reports (domo.domo) |RAW| - https://domo.domo.com/datasources/b7306441-b8a7-481c-baaf-4fffadb0ff61/details/overview?bucket=770
	const url = 'api/query/v1/execute/b7306441-b8a7-481c-baaf-4fffadb0ff61';
	const body = {
		querySource: 'data_table',
		useCache: true,
		query: {
			columns: [
				{
					exprType: 'COLUMN',
					column: 'Report Id'
				}
			],
			limit: {
				limit: 10000,
				offset: 0
			},
			orderByColumns: [],
			groupByColumns: [],
			where: {
				not: false,
				exprType: 'IN',
				leftExpr: {
					exprType: 'COLUMN',
					column: 'Owner Id'
				},
				selectSet: [
					{
						exprType: 'STRING_VALUE',
						value: userId
					}
				]
			},
			having: null
		},
		context: {
			calendar: 'StandardCalendar',
			features: {
				PerformTimeZoneConversion: true,
				AllowNullValues: true,
				TreatNumbersAsStrings: true
			}
		},
		// Used for Views Explorer, not the regular Data table
		viewTemplate: null,
		tableAliases: null
	};

	const response = await handleRequest('POST', url, body);
	const reports = response.rows;

	for (let i = 0; i < reports.length; i++) {
		const endpoint = `/api/content/v1/reportschedules/${reports[i][0]}`;

		let report = await handleRequest('GET', endpoint);
		report.ownerId = newOwnerId;
		await handleRequest('PUT', endpoint, report);
	}
	await logTransfers(
		userId,
		newOwnerId,
		'REPORT_SCHEDULE',
		reports.map((r) => r[0])
	);
}

//---------------------------------------------Goals------------------------------------------------//

async function getCurrentPeriod() {
	const response = await handleRequest(
		'GET',
		'/api/social/v1/objectives/periods?all=true'
	);
	const currentPeriod = response.find((period) => period.current);
	return currentPeriod.id;
}

async function transferGoals(userId, newOwnerId, periodId) {
	const url = `api/social/v2/objectives/profile?filterKeyResults=false&includeSampleGoal=false&periodId=${periodId}&ownerId=${userId}`;

	const goals = await handleRequest('GET', url);
	if (goals && goals.length > 0) {
		for (let i = 0; i < goals.length; i++) {
			const goalUrl = `/api/social/v1/objectives/${goals[i].id}`;

			goals[i].ownerId = newOwnerId;
			goals[i].owners = [
				{
					ownerId: newOwnerId,
					ownerType: 'USER',
					primary: false
				}
			];

			const body = goals[i];

			await handleRequest('PUT', goalUrl, body);
		}
		await logTransfers(
			userId,
			newOwnerId,
			'GOAL',
			goals.map((goal) => goal.id)
		);
	}
}

//-----------------------------------------Groups----------------------------------------//

async function transferGroups(userId, newOwnerId) {
	const limit = 100;
	let offset = 0;
	let moreData = true;

	while (moreData) {
		const url = `/api/content/v2/groups/grouplist?owner=${userId}&limit=${limit}&offset=${offset}`;
		const response = await handleRequest('GET', url);

		if (response && response.length > 0) {
			// Extract ids and append to list
			const groupIds = response
				.filter((group) => group.owners.some((owner) => owner.id === userId))
				.map((group) => group.id);
			if (groupIds.length > 0) {
				const body = groupIds.map((group) => ({
					groupId: group,
					addOwners: [{ type: 'USER', id: newOwnerId }],
					removeOwners: [{ type: 'USER', id: userId }]
				}));

				await handleRequest('PUT', '/api/content/v2/groups/access', body);

				await logTransfers(userId, newOwnerId, 'GROUP', groupIds);
			}

			// Increment offset to get next page
			offset += limit;

			// If less than pageSize returned, this is the last page
			if (response.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
}

//-----------------------------------------AppDB--------------------------------//
// Datastore owner cannot be updated

async function transferAppDbCollections(userId, newOwnerId) {
	let moreData = true;
	let pageNumber = 1;
	const pageSize = 100;

	while (moreData) {
		const data = {
			collectionFilteringList: [
				{
					filterType: 'ownedby',
					comparingCriteria: 'equals',
					typedValue: userId
				}
			],
			pageSize: pageSize,
			pageNumber: pageNumber
		};

		const response = await handleRequest(
			'POST',
			'/api/datastores/v1/collections/query',
			data
		);

		if (response.collections && response.collections.length > 0) {
			for (let i = 0; i < response.collections.length; i++) {
				const url = `/api/datastores/v1/collections/${response.collections[i].id}`;
				const body = { id: response.collections[i].id, owner: newOwnerId };

				await handleRequest('PUT', url, body);
			}
			await logTransfers(
				userId,
				newOwnerId,
				'COLLECTION',
				response.map((collection) => collection.id)
			);
			// Increment offset to get next page
			pageNumber++;

			// If less than pageSize returned, this is the last page
			if (response.collections.length < pageSize) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
}

//--------------------------Functions (Beast Modes and Variables)-------------------------//

async function transferFunctions(userId, newOwnerId) {
	let moreData = true;
	let offset = 0;
	const limit = 100;

	while (moreData) {
		const data = {
			filters: [{ field: 'owner', idList: [userId] }],
			sort: {
				field: 'name',
				ascending: true
			},
			limit: limit,
			offset: offset
		};

		const response = await handleRequest(
			'POST',
			'/api/query/v1/functions/search',
			data
		);

		const url = '/api/query/v1/functions/bulk/template';
		if (response.results && response.results.length > 0) {
			// Extract ids and append to list
			const beastModes = response.results
				.filter((func) => func.global === false)
				.map((beastMode) => ({
					id: beastMode.id,
					owner: newOwnerId,
					links: beastMode.links
				}));

			await handleRequest('POST', url, { update: beastModes });

			await logTransfers(
				userId,
				newOwnerId,
				'BEAST_MODE_FORMULA',
				beastModes.map((func) => func.id)
			);

			const variables = response.results
				.filter((func) => func.global === true)
				.map((variable) => ({
					id: variable.id,
					owner: newOwnerId,
					links: variable.links
				}));

			await handleRequest('POST', url, {
				update: variables
			});

			await logTransfers(
				userId,
				newOwnerId,
				'VARIABLE',
				variables.map((func) => func.id)
			);

			// Increment offset to get next page
			offset += limit;

			moreData = response.hasMore;
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
}

//-----------------------------Accounts---------------------//

async function transferAccounts(userId, newOwnerId) {
	let moreData = true;
	let offset = 0;
	const count = 100;
	let accountIds = [];

	while (moreData) {
		const data = {
			count: count,
			offset: offset,
			combineResults: false,
			hideSearchObjects: true,
			query: '**',
			filters: [
				{
					filterType: 'term',
					field: 'owned_by_id',
					value: userId,
					name: 'Owned by',
					not: false
				}
			],
			facetValuesToInclude: [],
			queryProfile: 'GLOBAL',
			entityList: [['account']]
		};

		const response = await handleRequest('POST', '/api/search/v1/query', data);
		if (
			response.searchResultsMap &&
			response.searchResultsMap.account.length > 0
		) {
			// Extract ids and append to list
			const ids = response.searchResultsMap.account.map(
				(account) => account.databaseId
			);
			accountIds.push(...ids);

			// Increment offset to get next page
			offset += count;

			// If less than pageSize returned, this is the last page
			if (response.searchResultsMap.account.length < count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
	for (let i = 0; i < accountIds.length; i++) {
		const transferUrl = `/api/data/v2/accounts/share/${accountIds[i]}`;
		const addBody = { type: 'USER', id: newOwnerId, accessLevel: 'OWNER' };
		await handleRequest('PUT', transferUrl, addBody);

		const removeBody = { type: 'USER', id: userId, accessLevel: 'NONE' };
		await handleRequest('PUT', transferUrl, removeBody);
	}

	await logTransfers(userId, newOwnerId, 'ACCOUNT', accountIds);
}

//---------------------------Jupyter Workspaces---------------------//

async function transferJupyterWorkspaces(userId, newOwnerId) {
	let moreData = true;
	let offset = 0;
	const limit = 100;
	let jupyterWorkspaceIds = [];

	while (moreData) {
		const data = {
			sortFieldMap: {
				LAST_RUN: 'DESC'
			},
			searchFieldMap: {},
			filters: [
				{
					type: 'OWNER',
					values: [userId]
				}
			],
			offset: offset,
			limit: limit
		};

		const response = await handleRequest(
			'POST',
			'/api/datascience/v1/search/workspaces',
			data
		);

		if (response.workspaces && response.workspaces.length > 0) {
			// Extract ids and append to list
			const ids = response.workspaces.map((workspace) => workspace.id);
			jupyterWorkspaceIds.push(...ids);

			// Increment offset to get next page
			offset += limit;

			// If less than pageSize returned, this is the last page
			if (response.workspaces.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}

	for (let i = 0; i < jupyterWorkspaceIds.length; i++) {
		const url = `/api/datascience/v1/workspaces/${jupyterWorkspaceIds[i]}/ownership`;
		await handleRequest('PUT', url, { newOwnerId });
	}
	await logTransfers(
		userId,
		newOwnerId,
		'DATA_SCIENCE_NOTEBOOK',
		jupyterWorkspaceIds
	);
}

//------------------------------Code Engine Packages--------------------------//

async function transferCodeEnginePackages(userId, newOwnerId) {
	let moreData = true;
	let offset = 0;
	const count = 100;
	let codeEnginePackageIds = [];

	while (moreData) {
		const data = {
			query: '**',
			entityList: [['package']],
			count: count,
			offset: offset,
			filters: [
				{
					field: 'owned_by_id',
					filterType: 'term',
					value: `${userId}:USER`
				}
			],
			hideSearchObjects: true,
			facetValuesToInclude: []
		};

		const response = await handleRequest('POST', '/api/search/v1/query', data);

		if (
			response.searchResultsMap.package &&
			response.searchResultsMap.package.length > 0
		) {
			// Extract ids and append to list
			const ids = response.searchResultsMap.package.map(
				(codeEngine) => codeEngine.uuid
			);
			codeEnginePackageIds.push(...ids);

			// Increment offset to get next page
			offset += count;

			// If less than pageSize returned, this is the last page
			if (response.searchResultsMap.package.length < count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}

	for (let i = 0; i < codeEnginePackageIds.length; i++) {
		const url = `/api/codeengine/v2/packages/${codeEnginePackageIds[i]}`;
		await handleRequest('PUT', url, { owner: parseInt(newOwnerId) });
	}
	await logTransfers(
		userId,
		newOwnerId,
		'CODEENGINE_PACKAGE',
		codeEnginePackageIds
	);
}

//---------------------------------------FileSets--------------------------------------------//

async function transferFilesets(userId, newOwnerId) {
	let moreData = true;
	let offset = 0;
	const limit = 100;
	let filesetIds = [];

	const data = {
		filters: [
			{
				field: 'owner',
				value: [userId],
				not: false,
				operator: 'EQUALS'
			}
		],
		fieldSort: [
			{
				field: 'updated',
				order: 'DESC'
			}
		],
		dateFilters: []
	};

	while (moreData) {
		const url = `/api/files/v1/filesets/search?offset=${offset}&limit=${limit}`;
		const response = await handleRequest('POST', url, data);

		if (response.filesets && response.filesets.length > 0) {
			// Extract ids and append to list
			const ids = response.filesets.map((fileset) => fileset.id);
			filesetIds.push(...ids);

			// Increment offset to get next page
			offset += limit;

			// If less than pageSize returned, this is the last page
			if (response.filesets.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}

	for (let i = 0; i < filesetIds.length; i++) {
		const url = `/api/files/v1/filesets/${filesetIds[i]}/ownership`;
		await handleRequest('POST', url, { userId: parseInt(newOwnerId) });
	}
	await logTransfers(userId, newOwnerId, 'FILESET', filesetIds);
}

//--------------------------------------Domo Everywhere Publications------------------------------------------//

// Limitation the new owner must be an owner of all the content
// Just get a list of publications for the manager to review

async function getPublications(userId, newOwnerId) {
	let publications = [];
	const url = '/api/publish/v2/publications';

	const response = await handleRequest('GET', url);
	if (response && response.length > 0) {
		for (let i = 0; i < response.length; i++) {
			const publicationId = response[i].id;
			const publicationUrl = `/api/publish/v2/publications/${publicationId}`;
			const response2 = await handleRequest('GET', publicationUrl);
			if (response2.content.userId == userId) {
				publications.push(publicationId);
			}
		}
	}

	await logTransfers(
		userId,
		newOwnerId,
		'PUBLICATION',
		publications,
		'NOT_TRANSFERRED',
		'Publications cannot be transferred as the new owner must be an owner of all the content'
	);
}

//-------------------------------------Domo Everywhere Subscriptions-----------------------------------------//

async function transferSubscriptions(userId, newOwnerId) {
	const limit = 40;
	let offset = 0;
	let moreData = true;
	let subscriptions = [];
	let subscriptionIds = [];

	while (moreData) {
		const url = 'api/publish/v2/subscriptions/summaries';

		const response = await handleRequest('GET', url);

		if (response && response.length > 0) {
			subscriptions.push(...response);

			// Increment offset to get next page
			offset += limit;

			// If less than limit returned, this is the last page
			if (response.length < limit) {
				moreData = false;
			}
		} else {
			moreData = false;
		}
	}

	for (let i = 0; i < subscriptions.length; i++) {
		const subscriptionUrl = `api/publish/v2/subscriptions/${subscriptions[i].subscriptionId}/share`;

		const subscription = await handleRequest('GET', subscriptionUrl);
		if (subscription.userId == userId) {
			subscriptionIds.push(subscription.subscription.id);
			const url = `/api/publish/v2/subscriptions/${subscription.subscription.id}`;

			const body = {
				publicationId: subscription.subscription.publicationId,
				domain: subscription.subscription.domain,
				customerId: subscription.subscription.customerId,
				userId: newOwnerId,
				userIds: subscription.shareUsers,
				groupIds: subscription.shareGroups
			};

			await handleRequest('PUT', url, body);
		}
	}
	await logTransfers(userId, newOwnerId, 'SUBSCRIPTION', subscriptionIds);
}

//--------------------------------------------------Sandbox Repositories---------------------------------//

async function transferRepositories(userId, newOwnerId) {
	const limit = 50;
	let offset = 0;
	let moreData = true;
	let repositoryIds = [];

	while (moreData) {
		const data = {
			query: {
				offset: offset,
				limit: limit,
				fieldSearchMap: {},
				sort: 'lastCommit',
				order: 'desc',
				filters: { userId: [userId] },
				dateFilters: {}
			}
		};

		const response = await handleRequest(
			'POST',
			'/api/version/v1/repositories/search',
			data
		);

		if (response.repositories && response.repositories.length > 0) {
			// Extract ids and append to list
			const ids = response.repositories.map((repository) => repository.id);
			repositoryIds.push(...ids);

			// Increment offset to get next page
			offset += limit;

			// If less than pageSize returned, this is the last page
			if (response.repositories.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}

	for (let i = 0; i < repositoryIds.length; i++) {
		const url = `/api/version/v1/repositories/${repositoryIds[i]}`;

		const body = {
			repositoryPermissionUpdates: [
				{
					userId: newOwnerId,
					groupId: '',
					permission: 'OWNER'
				}
			]
		};

		await handleRequest('POST', url, body);
	}
	await logTransfers(userId, newOwnerId, 'REPOSITORY', repositoryIds);
}

//-----------------------------------------Approvals--------------------------------------//

async function transferApprovals(userId, newOwnerId) {
	const url = '/api/synapse/approval/graphql';

	const data = {
		operationName: 'getFilteredRequests',
		variables: {
			query: {
				active: true,
				submitterId: null,
				approverId: userId,
				templateId: null,
				title: null,
				lastModifiedBefore: null
			},
			after: null,
			reverseSort: false
		},
		query:
			'query getFilteredRequests($query: QueryRequest!, $after: ID, $reverseSort: Boolean) {\n  workflowSearch(query: $query, type: "AC", after: $after, reverseSort: $reverseSort) {\n    edges {\n      cursor\n      node {\n        approval {\n          id\n          title\n          templateTitle\n          status\n          modifiedTime\n          version\n          providerName\n          approvalChainIdx\n          pendingApprover: pendingApproverEx {\n            id\n            type\n            displayName\n            ... on User {\n              title\n              avatarKey\n              __typename\n            }\n            ... on Group {\n              isDeleted\n              __typename\n            }\n            __typename\n          }\n          submitter {\n            id\n            type\n            displayName\n            avatarKey\n            isCurrentUser\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    pageInfo {\n      hasNextPage\n      hasPreviousPage\n      startCursor\n      endCursor\n      __typename\n    }\n    __typename\n  }\n}\n'
	};

	const response = await handleRequest('POST', url, data);
	const responseApprovals = response.data.workflowSearch.edges;

	const pendingApprovals = responseApprovals.filter(
		(approval) => approval.node.approval.status === 'PENDING'
	);

	const sentBackApprovals = responseApprovals.filter(
		(approval) => approval.node.approval.status === 'SENTBACK'
	);

	for (let i = 0; i < pendingApprovals.length; i++) {
		if (pendingApprovals[i].node.approval.status == 'PENDING') {
			const approverId = pendingApprovals[i].node.approval.pendingApprover.id;
			const approvalId = pendingApprovals[i].node.approval.id;
			const version = pendingApprovals[i].node.approval.version;

			const transferBody = [
				{
					operationName: 'replaceApprovers',
					variables: {
						actedOnApprovals: [
							{
								id: approvalId,
								version: version
							}
						],
						newApproverId: newOwnerId,
						newApproverType: 'PERSON'
					},
					query:
						'mutation replaceApprovers($actedOnApprovals: [ActedOnApprovalInput!]!, $newApproverId: ID!, $newApproverType: ApproverType) {\n  bulkReplaceApprover(actedOnApprovals: $actedOnApprovals, newApproverId: $newApproverId, newApproverType: $newApproverType) {\n    id\n    __typename\n  }\n}\n'
				}
			];

			await handleRequest('POST', url, transferBody);
		}
	}
	await logTransfers(
		userId,
		newOwnerId,
		'APPROVAL',
		pendingApprovals.map((approval) => approval.node.approval.id)
	);

	await logTransfers(
		userId,
		newOwnerId,
		'APPROVAL',
		sentBackApprovals.map((approval) => approval.node.approval.id),
		'NOT_TRANSFERRED',
		'Transferring of sent back approvals is not supported'
	);
}

//--------------------------------Custom Apps (Bricks and Pro Code Apps)-------------------------------------//

async function transferCustomApps(userId, newOwnerId) {
	const limit = 30;
	let offset = 0;
	let moreData = true;
	let appIds = [];

	while (moreData) {
		const url = `/api/apps/v1/designs?checkAdminAuthority=true&deleted=false&${limit}&offset=${offset}`;
		const response = await handleRequest('GET', url);

		if (response && response.length > 0) {
			for (let i = 0; i < response.length; i++) {
				if (response[i].owner == userId) {
					appIds.push(response[i].id);
					const transferUrl = `/api/apps/v1/designs/${response[i].id}/permissions/ADMIN`;
					const body = [newOwnerId];
					await handleRequest('POST', transferUrl, body);
				}
			}
			await logTransfers(userId, newOwnerId, 'APP', appIds); // Bricks are APP, Pro Code Apps are RYUU_APP

			if (response.length < limit) {
				moreData = false;
			}

			offset += limit;
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
}

//-------------------------------------AI Models--------------------------------//

async function transferAiModels(userId, newOwnerId) {
	const limit = 50;
	let offset = 0;
	let moreData = true;
	let models = [];

	while (moreData) {
		const data = {
			limit: 50,
			offset: 0,
			sortFieldMap: {
				CREATED: 'DESC'
			},
			searchFieldMap: { NAME: '' },
			filters: [{ type: 'OWNER', values: [userId] }],
			metricFilters: {},
			dateFilters: {},
			sortMetricMap: {}
		};

		const response = await handleRequest(
			'POST',
			'/api/datascience/ml/v1/search/models',
			data
		);

		if (response && response.models.length > 0) {
			// Extract ids and append to list
			const ids = response.models.map((model) => model.id);
			models.push(...ids);

			if (response.models.length < limit) {
				moreData = false;
			}

			offset += limit;
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}

	for (let i = 0; i < models.length; i++) {
		const url = `/api/datascience/ml/v1/models/${models[i].id}/ownership`;
		const data = { userId: newOwnerId };
		await handleRequest('POST', url, data);
	}
	await logTransfers(userId, newOwnerId, 'AI_MODEL', models); // Not recorded in the activity log
}

//-----------------------------------AI Projects----------------------------------//

async function transferAiProjects(userId, newOwnerId) {
	const limit = 50;
	let offset = 0;
	let moreData = true;
	let projects = [];

	while (moreData) {
		const data = {
			limit: 50,
			offset: 0,
			sortFieldMap: {
				CREATED: 'DESC'
			},
			searchFieldMap: { NAME: '' },
			filters: [{ type: 'OWNER', values: [userId] }],
			metricFilters: {},
			dateFilters: {},
			sortMetricMap: {}
		};

		const response = await handleRequest(
			'POST',
			'/api/datascience/ml/v1/search/projects',
			data
		);

		if (response && response.projects.length > 0) {
			// Extract ids and append to list
			const ids = response.projects.map((model) => model.id);
			projects.push(...ids);

			if (response.projects.length < limit) {
				moreData = false;
			}

			offset += limit;
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}

	for (let i = 0; i < projects.length; i++) {
		const url = `/api/datascience/ml/v1/projects/${projects[i].id}/ownership`;
		const data = { userId: newOwnerId };
		await handleRequest('POST', url, data);
	}
	await logTransfers(userId, newOwnerId, 'AI_PROJECT', projects); // Not recorded in the activity log
}

//--------------------------ProjectsAndTasks--------------------------//

async function transferProjectsAndTasks(userId, newOwnerId) {
	let projects = [];
	let tasks = [];
	let offset = 0;
	const limit = 100;
	let moreData = true;

	while (moreData) {
		const response = await handleRequest(
			'GET',
			`/api/content/v2/users/${userId}/projects?limit=${limit}&offset=${offset}`
		);

		if (response && response.length > 0) {
			// Extract ids and append to list
			projects.push(...response.projects);

			// Increment offset to get next page
			offset += limit;

			// If less than pageSize returned, this is the last page
			if (response.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}

	let projectIds = [];
	for (let i = 0; i < projects.length; i++) {
		// Get tasks for each project
		const taskResponse = await handleRequest(
			'GET',
			`/api/content/v1/projects/${projects[i].id}/tasks?assignedToOwnerId=${userId}`
		);

		if (taskResponse && taskResponse.length > 0) {
			tasks.push(...taskResponse.map((task) => task.id));
			taskResponse.forEach(async (task) => {
				if (task.primaryTaskOwner == userId) {
					task.primaryTaskOwner = newOwnerId;
				}
				task.contributors.push({
					assignedTo: newOwnerId,
					assignedBy: userId
				});
				task.owners.push({
					assignedTo: newOwnerId,
					assignedBy: userId
				});
				await handleRequest('PUT', `/api/content/v1/tasks/${task.id}`, task);
			});
		}

		if (projects[i].assignedTo == userId) {
			projectIds.push(projects[i].id);
			const url = `/api/content/v1/projects/${projects[i].id}`;
			const body = { id: projects[i].id, creator: newOwnerId };

			await handleRequest('PUT', url, body);
		}
	}

	await logTransfers(userId, newOwnerId, 'PROJECT_TASK', tasks);
	await logTransfers(userId, newOwnerId, 'PROJECT', projectIds);
}
