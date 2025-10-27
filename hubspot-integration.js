// hubspot-integration.js - Complete HubSpot CRM Integration

const axios = require('axios');

class HubSpotIntegration {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.hubapi.com';
    this.headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  // Create or update a contact
  async createOrUpdateContact(leadData, enrichedData = {}, score = 0) {
    try {
      // First, search for existing contact
      const existingContact = await this.searchContact(leadData.email);
      
      const properties = {
        email: leadData.email,
        firstname: leadData.firstName,
        lastname: leadData.lastName,
        company: leadData.company,
        jobtitle: leadData.title || '',
        
        // Custom properties (you need to create these in HubSpot)
        lead_score: score,
        lead_source: leadData.source || 'Website',
        lead_category: this.getCategory(score),
        
        // Enriched data
        annual_revenue: enrichedData.company?.revenue || '',
        number_of_employees: enrichedData.company?.employees || '',
        industry: enrichedData.company?.industry || leadData.industry || '',
        website: enrichedData.company?.website || '',
        technologies_used: enrichedData.technologies?.join(', ') || '',
        recent_funding: enrichedData.funding?.recentRound ? 'Yes' : 'No',
        linkedin_profile: enrichedData.socialProfiles?.linkedin || '',
        
        // Lifecycle stage
        lifecyclestage: score >= 60 ? 'marketingqualifiedlead' : 'lead'
      };
      
      if (existingContact) {
        // Update existing contact
        const response = await axios.patch(
          `${this.baseURL}/crm/v3/objects/contacts/${existingContact.id}`,
          { properties },
          { headers: this.headers }
        );
        console.log(`Updated HubSpot contact: ${leadData.email}`);
        return { id: existingContact.id, updated: true };
      } else {
        // Create new contact
        const response = await axios.post(
          `${this.baseURL}/crm/v3/objects/contacts`,
          { properties },
          { headers: this.headers }
        );
        console.log(`Created HubSpot contact: ${leadData.email}`);
        return { id: response.data.id, created: true };
      }
    } catch (error) {
      console.error('HubSpot contact sync error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Search for a contact by email
  async searchContact(email) {
    try {
      const response = await axios.post(
        `${this.baseURL}/crm/v3/objects/contacts/search`,
        {
          filterGroups: [{
            filters: [{
              propertyName: 'email',
              operator: 'EQ',
              value: email
            }]
          }]
        },
        { headers: this.headers }
      );
      
      return response.data.results?.[0] || null;
    } catch (error) {
      console.error('HubSpot search error:', error.message);
      return null;
    }
  }

  // Create a deal
  async createDeal(contactId, leadData, score) {
    try {
      const dealValue = this.estimateDealValue(score);
      
      const properties = {
        dealname: `${leadData.company} - Working Capital`,
        amount: dealValue,
        pipeline: 'default', // Update with your pipeline ID
        dealstage: score >= 85 ? 'qualifiedtobuy' : 'appointmentscheduled',
        closedate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        description: `Lead Score: ${score}/100\nSource: ${leadData.source}\nCreated: ${new Date().toISOString()}`
      };
      
      const response = await axios.post(
        `${this.baseURL}/crm/v3/objects/deals`,
        { properties },
        { headers: this.headers }
      );
      
      // Associate deal with contact
      await this.associateDealWithContact(response.data.id, contactId);
      
      console.log(`Created HubSpot deal for ${leadData.company}`);
      return response.data.id;
    } catch (error) {
      console.error('HubSpot deal creation error:', error.message);
      return null;
    }
  }

  // Associate deal with contact
  async associateDealWithContact(dealId, contactId) {
    try {
      await axios.put(
        `${this.baseURL}/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/3`,
        {},
        { headers: this.headers }
      );
    } catch (error) {
      console.error('Association error:', error.message);
    }
  }

  // Add contact to email sequence
  async addToSequence(contactId, sequenceId) {
    try {
      // This requires Sales Hub - using workflow enrollment instead
      await this.enrollInWorkflow(contactId);
    } catch (error) {
      console.error('Sequence enrollment error:', error.message);
    }
  }

  // Enroll in workflow (alternative to sequences for free/starter plans)
  async enrollInWorkflow(contactId, score = 0) {
    try {
      // You need to create these workflows in HubSpot first
      const workflowId = score >= 85 ? 'hot_lead_workflow' : 'nurture_workflow';
      
      // Note: Workflow API requires specific permissions
      console.log(`Would enroll contact ${contactId} in workflow ${workflowId}`);
      
      // For now, update contact property to trigger workflow
      await axios.patch(
        `${this.baseURL}/crm/v3/objects/contacts/${contactId}`,
        {
          properties: {
            workflow_trigger: workflowId,
            workflow_enrollment_date: new Date().toISOString()
          }
        },
        { headers: this.headers }
      );
    } catch (error) {
      console.error('Workflow enrollment error:', error.message);
    }
  }

  // Helper functions
  getCategory(score) {
    if (score >= 85) return 'HOT';
    if (score >= 60) return 'WARM';
    if (score >= 40) return 'QUALIFIED';
    return 'COLD';
  }

  estimateDealValue(score) {
    if (score >= 85) return 100000;
    if (score >= 60) return 50000;
    if (score >= 40) return 25000;
    return 10000;
  }

  // Get all contacts
  async getAllContacts(limit = 100) {
    try {
      const response = await axios.get(
        `${this.baseURL}/crm/v3/objects/contacts?limit=${limit}`,
        { headers: this.headers }
      );
      return response.data.results;
    } catch (error) {
      console.error('Error fetching contacts:', error.message);
      return [];
    }
  }

  // Get engagement analytics
  async getEngagementStats(contactId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/crm/v3/objects/contacts/${contactId}?properties=hs_email_opens,hs_email_clicks,hs_email_last_open_date`,
        { headers: this.headers }
      );
      return response.data.properties;
    } catch (error) {
      console.error('Error fetching engagement stats:', error.message);
      return {};
    }
  }
}

module.exports = HubSpotIntegration;
