// ============================================
// Snowflake Integration for GTM Platform
// ============================================
// Connects Express backend to Snowflake warehouse
// Logs leads, fetches analytics, syncs with HubSpot

const snowflake = require('snowflake-sdk');
require('dotenv').config();

// Create Snowflake connection
const connection = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT,
  username: process.env.SNOWFLAKE_USER,
  password: process.env.SNOWFLAKE_PASSWORD,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'COMPUTE_WH',
  database: process.env.SNOWFLAKE_DATABASE || 'GTM_DATA',
  schema: process.env.SNOWFLAKE_SCHEMA || 'PRODUCTION'
});

// Connect to Snowflake
function connectToSnowflake() {
  return new Promise((resolve, reject) => {
    connection.connect((err, conn) => {
      if (err) {
        console.error('❌ Failed to connect to Snowflake:', err.message);
        reject(err);
      } else {
        console.log('✅ Successfully connected to Snowflake');
        console.log(`   Database: ${process.env.SNOWFLAKE_DATABASE}`);
        console.log(`   Schema: ${process.env.SNOWFLAKE_SCHEMA}`);
        resolve(conn);
      }
    });
  });
}

// Execute SQL query
function executeQuery(sqlText, binds = []) {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: sqlText,
      binds: binds,
      complete: (err, stmt, rows) => {
        if (err) {
          console.error('❌ Query failed:', err.message);
          reject(err);
        } else {
          resolve(rows);
        }
      }
    });
  });
}

// Log lead to Snowflake
async function logLeadToSnowflake(leadData) {
  try {
    const query = `
      INSERT INTO contacts (
        id, email, first_name, last_name, company, 
        job_title, industry, company_size, lead_score, 
        lead_source, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP())
    `;
    
    const binds = [
      leadData.id || `lead_${Date.now()}`,
      leadData.email,
      leadData.firstName || leadData.first_name || '',
      leadData.lastName || leadData.last_name || '',
      leadData.company || 'Unknown',
      leadData.jobTitle || leadData.job_title || 'Not provided',
      leadData.industry || 'Unknown',
      leadData.companySize || leadData.company_size || 'Unknown',
      leadData.leadScore || leadData.lead_score || 0,
      leadData.source || leadData.lead_source || 'Website'
    ];

    await executeQuery(query, binds);
    console.log(`✅ Lead logged to Snowflake: ${leadData.email}`);
    
    return { success: true, message: 'Lead logged successfully' };
  } catch (error) {
    console.error('❌ Error logging lead:', error.message);
    throw error;
  }
}

// Get all contacts from Snowflake
async function getContacts(limit = 100) {
  try {
    const query = `
      SELECT 
        id,
        email,
        first_name,
        last_name,
        company,
        job_title,
        industry,
        company_size,
        lead_score,
        lead_source,
        created_at
      FROM contacts 
      ORDER BY created_at DESC 
      LIMIT ?
    `;
    
    const rows = await executeQuery(query, [limit]);
    console.log(`✅ Fetched ${rows.length} contacts from Snowflake`);
    return rows;
  } catch (error) {
    console.error('❌ Error fetching contacts:', error.message);
    throw error;
  }
}

// Get analytics from Snowflake
async function getAnalytics() {
  try {
    const query = `
      SELECT 
        COUNT(*) as total_leads,
        ROUND(AVG(lead_score), 2) as avg_score,
        COUNT(CASE WHEN lead_score > 80 THEN 1 END) as high_value_leads,
        COUNT(CASE WHEN created_at > DATEADD(day, -7, CURRENT_TIMESTAMP()) THEN 1 END) as leads_this_week,
        COUNT(CASE WHEN created_at > DATEADD(day, -30, CURRENT_TIMESTAMP()) THEN 1 END) as leads_this_month
      FROM contacts
    `;
    
    const rows = await executeQuery(query);
    console.log('✅ Analytics fetched from Snowflake');
    return rows[0];
  } catch (error) {
    console.error('❌ Error fetching analytics:', error.message);
    throw error;
  }
}

// Get leads by industry
async function getLeadsByIndustry() {
  try {
    const query = `
      SELECT 
        industry,
        COUNT(*) as count,
        ROUND(AVG(lead_score), 1) as avg_score
      FROM contacts
      GROUP BY industry
      ORDER BY avg_score DESC
    `;
    
    const rows = await executeQuery(query);
    console.log('✅ Industry breakdown fetched');
    return rows;
  } catch (error) {
    console.error('❌ Error fetching industry breakdown:', error.message);
    throw error;
  }
}

// Get high-value leads
async function getHighValueLeads(threshold = 85) {
  try {
    const query = `
      SELECT 
        email,
        first_name,
        last_name,
        company,
        job_title,
        lead_score,
        created_at
      FROM contacts
      WHERE lead_score > ?
      ORDER BY lead_score DESC
    `;
    
    const rows = await executeQuery(query, [threshold]);
    console.log(`✅ Found ${rows.length} high-value leads (score > ${threshold})`);
    return rows;
  } catch (error) {
    console.error('❌ Error fetching high-value leads:', error.message);
    throw error;
  }
}

// Log agent action to Snowflake
async function logAgentAction(actionData) {
  try {
    const query = `
      INSERT INTO agent_actions (
        id, action_type, action_description, action_timestamp
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP())
    `;
    
    const binds = [
      `action_${Date.now()}`,
      actionData.type || 'unknown',
      actionData.description || ''
    ];

    await executeQuery(query, binds);
    console.log(`✅ Agent action logged: ${actionData.type}`);
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error logging agent action:', error.message);
    throw error;
  }
}

// Close Snowflake connection
function closeConnection() {
  return new Promise((resolve, reject) => {
    connection.destroy((err, conn) => {
      if (err) {
        console.error('❌ Failed to close connection:', err.message);
        reject(err);
      } else {
        console.log('✅ Snowflake connection closed');
        resolve();
      }
    });
  });
}

// Export functions
module.exports = {
  connectToSnowflake,
  executeQuery,
  logLeadToSnowflake,
  getContacts,
  getAnalytics,
  getLeadsByIndustry,
  getHighValueLeads,
  logAgentAction,
  closeConnection
};
