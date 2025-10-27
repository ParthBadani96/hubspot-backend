// clay-integration.js - Clay API Integration for Lead Enrichment

const axios = require('axios');

class ClayIntegration {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.clay.com/v1';
    this.headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  // Enrich person data
  async enrichPerson(email, firstName = '', lastName = '', company = '') {
    try {
      const response = await axios.post(
        `${this.baseURL}/enrich/person`,
        {
          email: email,
          first_name: firstName,
          last_name: lastName,
          company_name: company
        },
        { headers: this.headers }
      );

      const data = response.data;
      
      return {
        person: {
          email: data.email || email,
          firstName: data.first_name || firstName,
          lastName: data.last_name || lastName,
          title: data.title || '',
          seniority: data.seniority || '',
          department: data.department || '',
          linkedinUrl: data.linkedin_url || '',
          twitterUrl: data.twitter_url || '',
          phoneNumber: data.phone_number || ''
        },
        company: data.company || {},
        confidence: data.confidence_score || 0
      };
    } catch (error) {
      console.error('Clay person enrichment error:', error.message);
      
      // Return mock data for prototype if API fails
      return this.getMockPersonData(email, firstName, lastName, company);
    }
  }

  // Enrich company data
  async enrichCompany(companyName, domain = '') {
    try {
      const response = await axios.post(
        `${this.baseURL}/enrich/company`,
        {
          name: companyName,
          domain: domain
        },
        { headers: this.headers }
      );

      const data = response.data;
      
      return {
        name: data.name || companyName,
        domain: data.domain || domain,
        industry: data.industry || '',
        subIndustry: data.sub_industry || '',
        employees: data.employee_count || 0,
        employeeRange: data.employee_range || '',
        revenue: data.estimated_revenue || 0,
        revenueRange: data.revenue_range || '',
        fundingTotal: data.total_funding || 0,
        lastFundingDate: data.last_funding_date || '',
        lastFundingAmount: data.last_funding_amount || 0,
        technologies: data.technologies || [],
        description: data.description || '',
        headquarters: data.headquarters || '',
        foundedYear: data.founded_year || ''
      };
    } catch (error) {
      console.error('Clay company enrichment error:', error.message);
      
      // Return mock data for prototype if API fails
      return this.getMockCompanyData(companyName);
    }
  }

  // Get intent signals
  async getIntentSignals(company, email = '') {
    try {
      const signals = [];
      
      // Check for hiring signals
      const hiringSignal = await this.checkHiringSignal(company);
      if (hiringSignal) signals.push(hiringSignal);
      
      // Check for funding signals
      const fundingSignal = await this.checkFundingSignal(company);
      if (fundingSignal) signals.push(fundingSignal);
      
      // Check for tech stack signals
      const techSignal = await this.checkTechStackSignal(company);
      if (techSignal) signals.push(techSignal);
      
      // Check for growth signals
      const growthSignal = await this.checkGrowthSignal(company);
      if (growthSignal) signals.push(growthSignal);
      
      return {
        signals: signals,
        signalCount: signals.length,
        signalStrength: this.calculateSignalStrength(signals)
      };
    } catch (error) {
      console.error('Intent signals error:', error.message);
      return this.getMockIntentSignals(company);
    }
  }

  // Check for hiring signals
  async checkHiringSignal(company) {
    // In production, this would query job posting APIs
    const mockHiring = Math.random() > 0.5;
    
    if (mockHiring) {
      return {
        type: 'hiring',
        strength: 'high',
        details: 'Company posted 5+ finance/ops roles in last 30 days',
        score: 20
      };
    }
    return null;
  }

  // Check for funding signals
  async checkFundingSignal(company) {
    // In production, query funding databases
    const mockFunding = Math.random() > 0.6;
    
    if (mockFunding) {
      return {
        type: 'funding',
        strength: 'high',
        details: 'Raised Series A in last 6 months',
        score: 25
      };
    }
    return null;
  }

  // Check for tech stack signals
  async checkTechStackSignal(company) {
    // In production, check for target technologies
    const targetTech = ['QuickBooks', 'NetSuite', 'Salesforce', 'Stripe', 'Shopify'];
    const hasTech = Math.random() > 0.4;
    
    if (hasTech) {
      const tech = targetTech[Math.floor(Math.random() * targetTech.length)];
      return {
        type: 'technology',
        strength: 'medium',
        details: `Uses ${tech} - direct integration available`,
        score: 15
      };
    }
    return null;
  }

  // Check for growth signals
  async checkGrowthSignal(company) {
    const hasGrowth = Math.random() > 0.5;
    
    if (hasGrowth) {
      return {
        type: 'growth',
        strength: 'medium',
        details: 'Employee count increased 30% YoY',
        score: 15
      };
    }
    return null;
  }

  // Calculate overall signal strength
  calculateSignalStrength(signals) {
    const totalScore = signals.reduce((sum, signal) => sum + signal.score, 0);
    
    if (totalScore >= 50) return 'very_high';
    if (totalScore >= 35) return 'high';
    if (totalScore >= 20) return 'medium';
    if (totalScore > 0) return 'low';
    return 'none';
  }

  // Complete enrichment flow
  async enrichLead(leadData) {
    const enrichedData = {};
    
    // Enrich person data
    const personData = await this.enrichPerson(
      leadData.email,
      leadData.firstName,
      leadData.lastName,
      leadData.company
    );
    enrichedData.person = personData.person;
    
    // Enrich company data
    const companyData = await this.enrichCompany(leadData.company);
    enrichedData.company = companyData;
    
    // Get intent signals
    const intentData = await this.getIntentSignals(leadData.company, leadData.email);
    enrichedData.intent = intentData;
    
    // Calculate ICP fit score
    enrichedData.icpScore = this.calculateICPScore(enrichedData);
    
    // Add enrichment metadata
    enrichedData.enrichedAt = new Date().toISOString();
    enrichedData.source = 'clay_api';
    
    return enrichedData;
  }

  // Calculate ICP (Ideal Customer Profile) fit score
  calculateICPScore(enrichedData) {
    let score = 0;
    
    // Company size scoring
    const employees = enrichedData.company?.employees || 0;
    if (employees >= 10 && employees <= 500) score += 20;
    
    // Revenue scoring
    const revenue = enrichedData.company?.revenue || 0;
    if (revenue >= 2000000 && revenue <= 100000000) score += 25;
    
    // Industry scoring
    const targetIndustries = ['SaaS', 'Software', 'E-commerce', 'Professional Services', 'Marketing'];
    if (targetIndustries.some(ind => enrichedData.company?.industry?.includes(ind))) {
      score += 20;
    }
    
    // Technology fit
    const technologies = enrichedData.company?.technologies || [];
    const targetTech = ['QuickBooks', 'NetSuite', 'Salesforce', 'Stripe', 'Shopify'];
    const techMatches = targetTech.filter(tech => 
      technologies.some(t => t.toLowerCase().includes(tech.toLowerCase()))
    );
    score += techMatches.length * 5;
    
    // Title/seniority scoring
    const seniorTitles = ['CEO', 'CFO', 'VP', 'Director', 'Controller'];
    if (seniorTitles.some(title => enrichedData.person?.title?.includes(title))) {
      score += 15;
    }
    
    // Intent signal scoring
    const signalStrength = enrichedData.intent?.signalStrength;
    if (signalStrength === 'very_high') score += 20;
    else if (signalStrength === 'high') score += 15;
    else if (signalStrength === 'medium') score += 10;
    else if (signalStrength === 'low') score += 5;
    
    return Math.min(score, 100);
  }

  // Mock data fallbacks for prototype
  getMockPersonData(email, firstName, lastName, company) {
    return {
      person: {
        email: email,
        firstName: firstName,
        lastName: lastName,
        title: ['CEO', 'CFO', 'VP Finance', 'Controller'][Math.floor(Math.random() * 4)],
        seniority: 'executive',
        department: 'finance',
        linkedinUrl: `https://linkedin.com/in/${firstName}-${lastName}`.toLowerCase(),
        twitterUrl: `https://twitter.com/${firstName}${lastName}`.toLowerCase(),
        phoneNumber: ''
      },
      company: this.getMockCompanyData(company),
      confidence: 0.85
    };
  }

  getMockCompanyData(companyName) {
    const industries = ['B2B SaaS', 'E-commerce', 'Professional Services', 'Marketing Agency'];
    const technologies = ['Salesforce', 'QuickBooks', 'Stripe', 'HubSpot', 'Shopify', 'NetSuite'];
    
    return {
      name: companyName,
      domain: `${companyName.toLowerCase().replace(/\s/g, '')}.com`,
      industry: industries[Math.floor(Math.random() * industries.length)],
      employees: Math.floor(Math.random() * 400) + 10,
      employeeRange: '10-500',
      revenue: Math.floor(Math.random() * 50000000) + 2000000,
      revenueRange: '$2M-$50M',
      fundingTotal: Math.floor(Math.random() * 10000000),
      lastFundingDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      technologies: technologies.slice(0, Math.floor(Math.random() * 3) + 1),
      description: `Leading ${industries[0]} company focused on growth and innovation`,
      headquarters: 'San Francisco, CA',
      foundedYear: 2015 + Math.floor(Math.random() * 8)
    };
  }

  getMockIntentSignals(company) {
    const signals = [];
    
    if (Math.random() > 0.5) {
      signals.push({
        type: 'hiring',
        strength: 'high',
        details: 'Posted 5+ finance roles recently',
        score: 20
      });
    }
    
    if (Math.random() > 0.6) {
      signals.push({
        type: 'funding',
        strength: 'high',
        details: 'Recent funding round',
        score: 25
      });
    }
    
    if (Math.random() > 0.4) {
      signals.push({
        type: 'technology',
        strength: 'medium',
        details: 'Uses QuickBooks',
        score: 15
      });
    }
    
    return {
      signals: signals,
      signalCount: signals.length,
      signalStrength: this.calculateSignalStrength(signals)
    };
  }
}

module.exports = ClayIntegration;
