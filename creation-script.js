#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * MajorDomo User Offboarding Workflow and Code Engine Package Creation Script
 *
 * Run via node creation-script.js
 *
 * This script helps users deploy the MajorDomo User Offboarding workflow and code engine package
 * to their own Domo instance. It will:
 * 1. Get Domo access token and instance from the user
 * 2. Create DomoStats scheduled reports dataset if needed
 * 3. Create MajorDomo User Offboarding Object Transfer Log dataset if needed
 * 4. Create MajorDomo User Offboarding code engine package
 * 5. Create Domo Product APIs Supplemental helper code engine package
 * 6. Create MajorDomo User Offboarding workflow
 */

class DomoPackageCreator {
	constructor() {
		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});
		this.baseUrl = '';
		this.accessToken = '';
		this.packageDefinition = null;
	}

	question(text) {
		return new Promise((resolve) => {
			this.rl.question(text, resolve);
		});
	}

	async getUserInputs() {
		console.log(
			'🚀 MajorDomo User Offboarding Workflow and Code Engine Package Creation Script'
		);
		console.log('===========================================\n');

		// Get Domo instance
		this.baseUrl = await this.question(
			'Enter your Domo instance or URL (e.g., mycompany or https://mycompany.domo.com): '
		);

		// Add protocol if not present
		if (
			!this.baseUrl.startsWith('http://') &&
			!this.baseUrl.startsWith('https://')
		) {
			this.baseUrl = 'https://' + this.baseUrl;
		}

		// Remove trailing slash if present
		this.baseUrl = this.baseUrl.replace(/\/$/, '');

		// Add .domo.com if not already present
		if (!this.baseUrl.includes('.domo.com')) {
			// Extract just the subdomain if they entered a full domain
			const hostname = this.baseUrl.replace(/^https?:\/\//, '');
			const subdomain = hostname.split('.')[0];
			this.baseUrl = `https://${subdomain}.domo.com`;
		}

		// Get access token
		this.accessToken = await this.question('Enter your Domo Access Token: ');

		console.log('\n✅ Credentials collected');
	}

	async fetchPackageFromGitHub(filename = 'package-definition.json') {
		console.log(`📥 Fetching ${filename} from GitHub...`);

		try {
			const response = await fetch(
				`https://api.github.com/repos/brycewc/domo-user-management/contents/${filename}`,
				{
					method: 'GET',
					headers: {
						'User-Agent': 'Domo-Package-Creator/1.0'
					}
				}
			);

			if (!response.ok) {
				throw new Error(
					`GitHub API request failed: ${response.status} ${response.statusText}`
				);
			}

			const data = await response.json();

			if (data.content) {
				// GitHub API returns base64 encoded content
				const packageContent = Buffer.from(data.content, 'base64').toString(
					'utf8'
				);
				const packageDefinition = JSON.parse(packageContent);
				console.log(`✅ ${filename} fetched from GitHub`);
				return packageDefinition;
			} else {
				throw new Error('No content found in GitHub response');
			}
		} catch (error) {
			throw new Error(
				`Failed to fetch ${filename} from GitHub: ${error.message}`
			);
		}
	}

	readPackageFromLocal(filename = 'package-definition.json') {
		console.log(`📁 Reading ${filename} from local file...`);

		const packagePath = path.join(__dirname, filename);

		if (!fs.existsSync(packagePath)) {
			throw new Error(`${filename} not found in current directory`);
		}

		const packageContent = fs.readFileSync(packagePath, 'utf8');
		const packageDefinition = JSON.parse(packageContent);
		console.log(`✅ Read ${filename} from local file`);
		return packageDefinition;
	}

	async getPackageDefinition(filename = 'package-definition.json') {
		try {
			return this.readPackageFromLocal(filename);
		} catch (error) {
			console.log(`⚠️ Local file not found: ${error.message}`);
			console.log('🔄 Falling back to GitHub API...');

			try {
				return await this.fetchPackageFromGitHub(filename);
			} catch (githubError) {
				throw new Error(
					`Failed to get package definition: ${githubError.message}`
				);
			}
		}
	}

	generateDisplayName(filename) {
		// Extract base name without "-package-definition.json"
		const baseName = filename.replace(/-package-definition\.json$/, '');

		// Replace hyphens with spaces and split into words
		const words = baseName.split('-');

		// Capitalize each word, with special handling for "majordomo"
		const capitalizedWords = words.map((word) => {
			if (word.toLowerCase() === 'majordomo') {
				return 'MajorDomo';
			}
			if (word.toLowerCase() === 'apis') {
				return 'APIs';
			}
			return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
		});

		return capitalizedWords.join(' ');
	}

	async getWorkflowDefinition(filename = 'workflow-definition.json') {
		try {
			return this.readWorkflowFromLocal(filename);
		} catch (error) {
			console.log(`⚠️ Local workflow file not found: ${error.message}`);
			console.log('🔄 Falling back to GitHub API...');

			try {
				return await this.fetchWorkflowFromGitHub(filename);
			} catch (githubError) {
				throw new Error(
					`Failed to get workflow definition: ${githubError.message}`
				);
			}
		}
	}

	async fetchWorkflowFromGitHub(filename = 'workflow-definition.json') {
		console.log(`📥 Fetching ${filename} from GitHub...`);

		try {
			const response = await fetch(
				`https://api.github.com/repos/brycewc/domo-user-management/contents/${filename}`,
				{
					method: 'GET',
					headers: {
						'User-Agent': 'Domo-Package-Creator/1.0'
					}
				}
			);

			if (!response.ok) {
				throw new Error(
					`GitHub API request failed: ${response.status} ${response.statusText}`
				);
			}

			const data = await response.json();

			if (data.content) {
				// GitHub API returns base64 encoded content
				const workflowContent = Buffer.from(data.content, 'base64').toString(
					'utf8'
				);
				const workflowDefinition = JSON.parse(workflowContent);
				console.log(`✅ ${filename} fetched from GitHub`);
				return workflowDefinition;
			} else {
				throw new Error('No content found in GitHub response');
			}
		} catch (error) {
			throw new Error(
				`Failed to fetch ${filename} from GitHub: ${error.message}`
			);
		}
	}

	readWorkflowFromLocal(filename = 'workflow-definition.json') {
		console.log(`📁 Reading ${filename} from local file...`);

		const workflowPath = path.join(__dirname, filename);

		if (!fs.existsSync(workflowPath)) {
			throw new Error(`${filename} not found in current directory`);
		}

		const workflowContent = fs.readFileSync(workflowPath, 'utf8');
		const workflowDefinition = JSON.parse(workflowContent);
		console.log(`✅ ${filename} read from local file`);
		return workflowDefinition;
	}

	prepareWorkflowDefinition(
		workflowDefinition,
		packageMappings,
		currentUserId
	) {
		console.log('🔧 Preparing workflow definition with updated package IDs...');

		if (!workflowDefinition) {
			throw new Error('No workflow definition provided');
		}

		// Create a copy to avoid mutating the original
		const preparedWorkflow = JSON.parse(JSON.stringify(workflowDefinition));

		// Apply package ID and version replacements via JSON manipulation
		for (const [oldId, newMapping] of Object.entries(packageMappings)) {
			// Find all nebula function nodes with this package ID and update them
			if (
				preparedWorkflow.designElements &&
				Array.isArray(preparedWorkflow.designElements)
			) {
				preparedWorkflow.designElements.forEach((element) => {
					// Check if this is a nebula function task with matching package ID
					if (
						element.data &&
						element.data.taskType === 'nebulaFunction' &&
						element.data.metadata &&
						element.data.metadata.packageId === oldId
					) {
						// Update package ID
						element.data.metadata.packageId = newMapping.id;

						// Update version if provided
						if (newMapping.version) {
							element.data.metadata.version = newMapping.version;
						}
					}
				});
			}
		}

		// Replace hardcoded user ID (1813188617) with current user ID
		// This still uses string replacement as it's in various value fields
		if (currentUserId) {
			console.log(`🔄 Updating user ID from 1813188617 to: ${currentUserId}`);
			let workflowString = JSON.stringify(preparedWorkflow);
			const userIdRegex = new RegExp('"value":\\s*"1813188617"', 'g');
			workflowString = workflowString.replace(
				userIdRegex,
				`"value": "${currentUserId}"`
			);
			const updatedWorkflow = JSON.parse(workflowString);

			console.log(
				'✅ Workflow definition prepared with updated package references and user ID'
			);
			return updatedWorkflow;
		}

		console.log(
			'✅ Workflow definition prepared with updated package references'
		);
		return preparedWorkflow;
	}

	async createWorkflow(packageMappings) {
		console.log('🔄 Creating MajorDomo User Offboarding workflow...');

		try {
			// Step 1: Get current user ID
			const currentUserId = await this.getCurrentUserId();

			// Step 2: Create workflow model
			const createResponse = await fetch(
				`${this.baseUrl}/api/workflow/v2/models`,
				{
					method: 'POST',
					headers: {
						'X-Domo-Developer-Token': this.accessToken,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						name: 'MajorDomo User Offboarding',
						description:
							"Automatically deletes a user's sessions, transfers their content to a new owner, records what was transferred, then deletes the user.",
						versions: [
							{
								version: '1.0.0'
							}
						]
					})
				}
			);

			if (!createResponse.ok) {
				const errorText = await createResponse.text();
				throw new Error(
					`Failed to create workflow: ${createResponse.status} ${errorText}`
				);
			}

			const createData = await createResponse.json();
			const workflowId = createData.id;

			console.log(`✅ Workflow model created with ID: ${workflowId}`);

			// Step 3: Get and prepare workflow definition
			const workflowDefinition = await this.getWorkflowDefinition();
			const preparedDefinition = this.prepareWorkflowDefinition(
				workflowDefinition,
				packageMappings,
				currentUserId
			);

			// Step 4: Update workflow version with full definition
			const updateResponse = await fetch(
				`${this.baseUrl}/api/workflow/v2/models/${workflowId}/versions/1.0.0/definition`,
				{
					method: 'PUT',
					headers: {
						'X-Domo-Developer-Token': this.accessToken,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(preparedDefinition)
				}
			);

			if (!updateResponse.ok) {
				const errorText = await updateResponse.text();
				throw new Error(
					`Failed to update workflow definition: ${updateResponse.status} ${errorText}`
				);
			}

			console.log('✅ Workflow definition updated successfully');

			return {
				id: workflowId,
				name: 'MajorDomo User Offboarding',
				version: '1.0.0'
			};
		} catch (error) {
			throw new Error(`Failed to create workflow: ${error.message}`);
		}
	}

	async searchForExistingLogDataset(currentUserId) {
		console.log(
			'🔍 Searching for existing MajorDomo User Offboarding Object Transfer Log dataset...'
		);

		try {
			const response = await fetch(`${this.baseUrl}/api/search/v1/query`, {
				method: 'POST',
				headers: {
					'X-Domo-Developer-Token': this.accessToken,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					entities: ['DATASET'],
					filters: [
						{
							field: 'name_sort',
							filterType: 'wildcard',
							query: '*'
						}
					],
					combineResults: true,
					hideSearchObjects: true,
					query: 'MajorDomo User Offboarding Object Transfer Log',
					count: 100,
					offset: 0,
					sort: {
						isRelevance: false,
						fieldSorts: [
							{
								field: 'create_date',
								sortOrder: 'DESC'
							}
						]
					},
					user: currentUserId
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.log(`⚠️ Search API error: ${response.status} ${errorText}`);
				return null;
			}

			const data = await response.json();

			if (
				data.searchResultsMap &&
				data.searchResultsMap.combined &&
				data.searchResultsMap.combined.length > 0
			) {
				const existingDataset = data.searchResultsMap.combined[0];
				const datasetId = existingDataset.databaseId;
				console.log(`✅ Found existing log dataset with ID: ${datasetId}`);
				return datasetId;
			}

			console.log('▶️ No existing log dataset found');
			return null;
		} catch (error) {
			console.log(`⚠️ Error searching for existing dataset: ${error.message}`);
			return null;
		}
	}

	async searchForExistingDomostatsScheduledReportsDataset() {
		console.log(
			'🔍 Searching for existing DomoStats scheduled reports dataset...'
		);

		try {
			// Step 1: Search for DomoStats datasets
			const searchResponse = await fetch(
				`${this.baseUrl}/api/search/v1/query`,
				{
					method: 'POST',
					headers: {
						'X-Domo-Developer-Token': this.accessToken,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						entities: ['DATASET'],
						filters: [
							{
								filterType: 'term',
								field: 'dataprovidername_facet',
								value: 'DomoStats',
								name: 'DomoStats',
								not: false
							},
							{
								field: 'name_sort',
								filterType: 'wildcard',
								query: '*'
							}
						],
						combineResults: true,
						hideSearchObjects: true,
						query: '*',
						count: 100,
						offset: 0,
						sort: {
							isRelevance: false,
							fieldSorts: [
								{
									field: 'create_date',
									sortOrder: 'DESC'
								}
							]
						}
					})
				}
			);

			if (!searchResponse.ok) {
				const errorText = await searchResponse.text();
				console.log(
					`⚠️ DomoStats dataset search API error: ${searchResponse.status} ${errorText}`
				);
				return null;
			}

			const searchData = await searchResponse.json();

			if (
				!searchData.searchResultsMap ||
				!searchData.searchResultsMap.combined ||
				searchData.searchResultsMap.combined.length === 0
			) {
				console.log('▶️ No DomoStats datasets found');
				return null;
			}

			// Step 2: Extract database IDs from search results
			const databaseIds = searchData.searchResultsMap.combined.map(
				(dataset) => dataset.databaseId
			);
			console.log(
				`🔍 Found ${databaseIds.length} DomoStats datasets, checking details...`
			);

			// Step 3: Get detailed info for these datasets
			const bulkResponse = await fetch(
				`${this.baseUrl}/api/data/v3/datasources/bulk?includePrivate=true&includeAllDetails=true`,
				{
					method: 'POST',
					headers: {
						'X-Domo-Developer-Token': this.accessToken,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(databaseIds)
				}
			);

			if (!bulkResponse.ok) {
				const errorText = await bulkResponse.text();
				console.log(
					`⚠️ Bulk datasources API error: ${bulkResponse.status} ${errorText}`
				);
				return null;
			}

			const bulkData = await bulkResponse.json();

			if (!bulkData.dataSources || bulkData.dataSources.length === 0) {
				console.log('▶️ No datasource details found');
				return null;
			}

			// Step 4: Extract stream IDs
			const streamIds = bulkData.dataSources
				.map((dataSource) => dataSource.streamId)
				.filter((streamId) => streamId);

			if (streamIds.length === 0) {
				console.log('▶️ No stream IDs found in datasources');
				return null;
			}

			console.log(
				`🔍 Checking ${streamIds.length} streams for ScheduledReports configuration...`
			);

			// Step 5: Get stream details to find the one with ScheduledReports configuration
			const streamsResponse = await fetch(
				`${
					this.baseUrl
				}/api/data/v1/streams/bulk?fields=all&streamId=${streamIds.join(',')}`,
				{
					method: 'GET',
					headers: {
						'X-Domo-Developer-Token': this.accessToken,
						'Content-Type': 'application/json'
					}
				}
			);

			if (!streamsResponse.ok) {
				const errorText = await streamsResponse.text();
				console.log(
					`⚠️ Streams API error: ${streamsResponse.status} ${errorText}`
				);
				return null;
			}

			const streamsData = await streamsResponse.json();

			// Step 6: Filter for the stream with ScheduledReports configuration
			const scheduledReportsStream = streamsData.find((stream) => {
				if (!stream.configuration || !Array.isArray(stream.configuration)) {
					return false;
				}

				return stream.configuration.some(
					(config) =>
						config.name === 'report' && config.value === 'ScheduledReports'
				);
			});

			if (scheduledReportsStream) {
				// Find the corresponding dataset ID from our bulk data
				const correspondingDataSource = bulkData.dataSources.find(
					(ds) => ds.streamId === scheduledReportsStream.id
				);

				if (correspondingDataSource) {
					console.log(
						`✅ Found DomoStats scheduled reports dataset with ID: ${correspondingDataSource.id}`
					);
					return correspondingDataSource.id;
				}
			}

			console.log('▶️ No DomoStats scheduled reports dataset found');
			return null;
		} catch (error) {
			console.log(`⚠️ Error searching for DomoStats dataset: ${error.message}`);
			return null;
		}
	}

	async createDomostatsScheduledReportsDataset() {
		console.log('📊 Creating new DomoStats scheduled reports dataset...');

		try {
			const response = await fetch(`${this.baseUrl}/api/data/v1/streams`, {
				method: 'POST',
				headers: {
					'X-Domo-Developer-Token': this.accessToken,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					transport: {
						type: 'CONNECTOR',
						description: 'com.domo.connector.domostats',
						version: 2
					},
					configuration: [
						{
							category: 'METADATA',
							name: 'report',
							type: 'string',
							value: 'ScheduledReports'
						},
						{
							category: 'METADATA',
							name: 'advancedQuery',
							type: 'string',
							value: 'true'
						},
						{
							category: 'METADATA',
							name: '_description_',
							type: 'string',
							value: ''
						},
						{
							category: 'METADATA',
							name: 'cloud',
							type: 'string',
							value: 'domo'
						}
					],
					account: null,
					dataProvider: {
						key: 'domostats'
					},
					dataSource: {
						name: 'DomoStats Scheduled Reports',
						description: '',
						cloudId: 'domo'
					},
					advancedScheduleJson:
						'{"type":"DAY","at":"12:09 PM","timezone":"UTC"}',
					scheduleRetryExpression: null
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Failed to create DomoStats dataset: ${response.status} ${errorText}`
				);
			}

			const data = await response.json();
			const domostatsScheduledReportsDatasetId = data.dataSource.id;

			console.log(
				`✅ DomoStats scheduled reports dataset created with ID: ${domostatsScheduledReportsDatasetId}`
			);
			return domostatsScheduledReportsDatasetId;
		} catch (error) {
			throw new Error(`Failed to create DomoStats dataset: ${error.message}`);
		}
	}

	async setupDomostatsScheduledReportsDataset() {
		console.log('📊 Setting up DomoStats scheduled reports dataset...');

		try {
			// Check if dataset already exists
			const existingDatasetId =
				await this.searchForExistingDomostatsScheduledReportsDataset();

			if (existingDatasetId) {
				console.log(
					`♻️  Using existing DomoStats dataset with ID: ${existingDatasetId}`
				);
				return existingDatasetId;
			}

			// Create new dataset if none found
			console.log(
				'📊 DomoStats scheduled reports dataset not found, creating new one...'
			);
			return await this.createDomostatsScheduledReportsDataset();
		} catch (error) {
			throw new Error(`Failed to set up DomoStats dataset: ${error.message}`);
		}
	}

	async createLogDataset() {
		console.log('📊 Setting up MajorDomo User Offboarding Log dataset...');

		try {
			// First get current user ID for search
			const currentUserId = await this.getCurrentUserId();

			// Check if dataset already exists
			const existingDatasetId = await this.searchForExistingLogDataset(
				currentUserId
			);

			if (existingDatasetId) {
				console.log(
					`♻️  Using existing log dataset with ID: ${existingDatasetId}`
				);
				return existingDatasetId;
			}

			// Create new dataset if none found
			console.log('📊 Creating new MajorDomo User Offboarding Log dataset...');

			const response = await fetch(`${this.baseUrl}/api/data/v2/webforms`, {
				method: 'POST',
				headers: {
					'X-Domo-Developer-Token': this.accessToken,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					cloudId: 'domo',
					columns: [
						{
							id: 'userId',
							name: 'userId',
							type: 'LONG'
						},
						{
							id: 'newOwnerId',
							name: 'newOwnerId',
							type: 'LONG'
						},
						{
							id: 'type',
							name: 'type',
							type: 'STRING'
						},
						{
							id: 'id',
							name: 'id',
							type: 'STRING'
						},
						{
							id: 'date',
							name: 'date',
							type: 'DATETIME'
						},
						{
							id: 'status',
							name: 'status',
							type: 'STRING'
						},
						{
							id: 'notes',
							name: 'notes',
							type: 'STRING'
						}
					],
					name: 'MajorDomo User Offboarding Object Transfer Log'
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Failed to create log dataset: ${response.status} ${errorText}`
				);
			}

			const data = await response.json();
			const logDatasetId = data.dataSource.id;

			console.log(`✅ New log dataset created with ID: ${logDatasetId}`);
			return logDatasetId;
		} catch (error) {
			throw new Error(`Failed to set up log dataset: ${error.message}`);
		}
	}

	async getCurrentUserId() {
		console.log('👤 Getting current user ID...');

		try {
			const response = await fetch(
				`${this.baseUrl}/api/identity/v1/authentication/session`,
				{
					method: 'GET',
					headers: {
						'X-Domo-Developer-Token': this.accessToken
					}
				}
			);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Failed to get current user ID: ${response.status} ${errorText}`
				);
			}

			const data = await response.json();
			const currentUserId = data.userId;

			console.log(`✅ Current user ID: ${currentUserId}`);
			return currentUserId.toString();
		} catch (error) {
			throw new Error(`Failed to get current user ID: ${error.message}`);
		}
	}

	preparePackage(
		packageDefinition,
		filename,
		logDatasetId = null,
		domostatsScheduledReportsDatasetId = null
	) {
		console.log('🔧 Preparing package for deployment...');

		if (!packageDefinition) {
			throw new Error('No package definition provided');
		}

		// Create a copy to avoid mutating the original
		const preparedPackage = JSON.parse(JSON.stringify(packageDefinition));

		// Reset version to 1.0.0
		preparedPackage.version = '1.0.0';

		// Clear package ID so a new one will be generated
		delete preparedPackage.packageId;
		delete preparedPackage.createdOn;
		delete preparedPackage.updatedOn;
		delete preparedPackage.releasedOn;
		delete preparedPackage.createdBy;
		delete preparedPackage.updatedBy;

		preparedPackage.id = '';

		// Add display name based on filename
		preparedPackage.name = this.generateDisplayName(filename);
		preparedPackage.language = 'JAVASCRIPT';
		preparedPackage.environment = 'LAMBDA';
		preparedPackage.manifest = {
			functions: preparedPackage.functions,
			configuration: preparedPackage.configuration
		};
		delete preparedPackage.functions;
		delete preparedPackage.configuration;

		// Replace hardcoded logDatasetId with dynamic one for MajorDomo package
		if (logDatasetId && filename.includes('majordomo')) {
			console.log(`🔄 Updating log dataset ID to: ${logDatasetId}`);
			preparedPackage.code = preparedPackage.code.replace(
				/const logDatasetId = '[^']+'/,
				`const logDatasetId = '${logDatasetId}'`
			);
		}

		// Replace hardcoded DomoStats dataset ID for MajorDomo package
		if (
			domostatsScheduledReportsDatasetId &&
			filename.includes('majordomo-user-offboarding')
		) {
			console.log(
				`🔄 Updating DomoStats scheduled reports dataset ID to: ${domostatsScheduledReportsDatasetId}`
			);
			preparedPackage.code = preparedPackage.code.replace(
				/const domostatsScheduledReportsDatasetId = '[^']+'/,
				`const domostatsScheduledReportsDatasetId = '${domostatsScheduledReportsDatasetId}'`
			);
		}

		console.log(
			`✅ Package prepared with version 1.0.0, cleared packageId, and name: ${preparedPackage.name}`
		);
		return preparedPackage;
	}

	async createPackageInDomo(packageDefinition) {
		console.log(
			`🚀 Creating package "${packageDefinition.name}" in Domo instance...`
		);

		try {
			const response = await fetch(
				`${this.baseUrl}/api/codeengine/v2/packages`,
				{
					method: 'POST',
					headers: {
						'X-Domo-Developer-Token': this.accessToken,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(packageDefinition)
				}
			);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Domo API error ${response.status}: ${errorText}`);
			}

			try {
				const data = await response.json();
				console.log(
					`✅ Package "${packageDefinition.name}" created successfully!`
				);
				console.log(`📦 Package ID: ${data.packageId || data.id || 'Unknown'}`);
				return data;
			} catch (error) {
				// Response might not be JSON
				const text = await response.text();
				console.log(
					`✅ Package "${packageDefinition.name}" created successfully (response not JSON)`
				);
				return { id: 'unknown', packageId: 'unknown', response: text };
			}
		} catch (error) {
			throw new Error(`Request failed: ${error.message}`);
		}
	}

	async deployPackageVersion(packageId, packageName) {
		console.log(`🚀 Deploying package "${packageName}" version 1.0.0...`);

		try {
			const response = await fetch(
				`${this.baseUrl}/api/codeengine/v2/packages/${packageId}/versions/1.0.0/release`,
				{
					method: 'POST',
					headers: {
						'X-Domo-Developer-Token': this.accessToken
					}
				}
			);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Failed to deploy package: ${response.status} ${errorText}`
				);
			}

			console.log(
				`✅ Package "${packageName}" version 1.0.0 deployed successfully!`
			);
		} catch (error) {
			throw new Error(`Failed to deploy package: ${error.message}`);
		}
	}

	async createSinglePackage(
		filename,
		logDatasetId = null,
		domostatsScheduledReportsDatasetId = null
	) {
		const packageDefinition = await this.getPackageDefinition(filename);
		const preparedPackage = this.preparePackage(
			packageDefinition,
			filename,
			logDatasetId,
			domostatsScheduledReportsDatasetId
		);
		const response = await this.createPackageInDomo(preparedPackage);

		// Deploy the package version
		const packageId = response.packageId || response.id;
		if (packageId && packageId !== 'unknown') {
			await this.deployPackageVersion(packageId, preparedPackage.name);
		}

		return response;
	}

	displaySuccess(packages = [], workflowInfo = null) {
		console.log('\n🎉 Deployment Complete!');
		console.log('=======================');

		if (packages.length === 1) {
			console.log(
				'Your Domo Code Engine Package has been successfully created.'
			);
		} else {
			console.log(
				`${packages.length} Domo Code Engine Packages have been successfully created.`
			);
		}

		if (workflowInfo) {
			console.log('The MajorDomo User Offboarding Workflow has been created.');
		}

		console.log(`\n🌐 Domo Instance: ${this.baseUrl}`);

		if (packages.length > 0) {
			console.log('\n📦 Created Packages:');
			packages.forEach((pkg, index) => {
				const packageId = pkg.packageId || pkg.id;
				const name = pkg.name || `Package ${index + 1}`;
				console.log(`   ${index + 1}. ${name}`);
				console.log(`      - Package ID: ${packageId || 'Unknown'}`);
				if (packageId && packageId !== 'unknown') {
					console.log(`      - URL: ${this.baseUrl}/codeengine/${packageId}`);
				}
			});
		}

		if (workflowInfo) {
			console.log('\n🔄 Created Workflow:');
			console.log(`   - Name: ${workflowInfo.name}`);
			console.log(`   - Workflow ID: ${workflowInfo.id}`);
			console.log(`   - Version: ${workflowInfo.version}`);
			console.log(
				`   - URL: ${this.baseUrl}/workflows/models/${workflowInfo.id}`
			);
		}

		console.log('\n📖 Next steps:');
		console.log('   1. Test the package functions');
		if (workflowInfo) {
			console.log('   2. Test the workflow with sample data');
			console.log('   3. Configure workflow triggers and notifications');
		}
	}

	async run() {
		try {
			await this.getUserInputs();

			// Create the log dataset first
			const logDatasetId = await this.createLogDataset();

			// Set up the DomoStats dataset
			const domostatsScheduledReportsDatasetId =
				await this.setupDomostatsScheduledReportsDataset();

			// Create packages with dynamic dataset IDs
			const packages = [];
			const packageMappings = {};
			const filenames = [
				'majordomo-user-offboarding-package-definition.json',
				'domo-product-apis-supplemental-package-definition.json'
			];

			for (const filename of filenames) {
				try {
					const packageResponse = await this.createSinglePackage(
						filename,
						filename.includes('majordomo-user-offboarding')
							? logDatasetId
							: null,
						filename.includes('majordomo-user-offboarding')
							? domostatsScheduledReportsDatasetId
							: null
					);
					packages.push(packageResponse);

					// Map old package IDs to new ones for workflow replacement
					if (filename.includes('majordomo-user-offboarding')) {
						packageMappings['d5c46aaa-963f-4e01-a84a-f89ccea6465a'] = {
							id: packageResponse.packageId || packageResponse.id,
							version: '1.0.0'
						};
					} else if (filename.includes('domo-product-apis-supplemental')) {
						packageMappings['3a08d004-f80c-4d44-879f-5b0319968fd1'] = {
							id: packageResponse.packageId || packageResponse.id,
							version: '1.0.0'
						};
					}
				} catch (error) {
					console.error(
						`\n❌ Failed to create package from ${filename}: ${error.message}`
					);
				}
			}

			// Create workflow with updated package references
			let workflowInfo = null;
			try {
				workflowInfo = await this.createWorkflow(packageMappings);
				console.log(
					`✅ Workflow created: ${workflowInfo.name} (ID: ${workflowInfo.id})`
				);
			} catch (error) {
				console.error(`\n❌ Failed to create workflow: ${error.message}`);
			}

			this.displaySuccess(packages, workflowInfo);
		} catch (error) {
			console.error('\n❌ Error:', error.message);
			console.log('\n🔍 Troubleshooting tips:');
			console.log('   - Verify your Domo instance URL is correct');
			console.log(
				'   - Ensure your Developer Access Token has the required permissions'
			);
			console.log(
				'   - Check that Code Engine is enabled in your Domo instance'
			);
			process.exit(1);
		} finally {
			this.rl.close();
		}
	}
	async createMultiplePackages(filenames) {
		const packages = [];

		for (const filename of filenames) {
			try {
				const packageResponse = await this.createSinglePackage(filename);
				packages.push(packageResponse);
			} catch (error) {
				console.error(
					`\n❌ Failed to create package from ${filename}: ${error.message}`
				);
			}
		}

		return packages;
	}
}

// Run the script if called directly
if (require.main === module) {
	const creator = new DomoPackageCreator();
	creator.run().catch((error) => {
		console.error('Unexpected error:', error);
		process.exit(1);
	});
}

module.exports = DomoPackageCreator;
