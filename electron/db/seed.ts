import type Database from 'better-sqlite3-multiple-ciphers'
import categoriesData from '../../data/categories.json'
import keywordRulesData from '../../data/keyword_rules.json'
import mccMappingsData from '../../data/mcc_mappings.json'
import vpaMappingsData from '../../data/vpa_mappings.json'
import type { CategoryRuleType } from './types'

const USER_ID = 1

interface CategorySeed {
  name: string
  subcategories: string[]
}

interface KeywordRuleSeed {
  pattern: string
  category: string
  subcategory?: string
  priority: number
}

interface MccRuleSeed {
  mcc: string
  category: string
  subcategory?: string
}

interface VpaRuleSeed {
  pattern: string
  category: string
  subcategory?: string
}

/** Idempotent: seeds the single Phase 1 user, default categories, and starter rules on first run only. */
export function seedDatabase(db: Database.Database): void {
  seedUser(db)
  if (getCategoryCount(db) === 0) {
    seedCategories(db)
    seedRules(db)
  }
}

function seedUser(db: Database.Database): void {
  db.prepare('INSERT OR IGNORE INTO user (id) VALUES (?)').run(USER_ID)
}

function getCategoryCount(db: Database.Database): number {
  const row = db.prepare('SELECT count(*) as count FROM category WHERE user_id = ?').get(USER_ID) as {
    count: number
  }
  return row.count
}

function seedCategories(db: Database.Database): void {
  const insertCategory = db.prepare(
    'INSERT INTO category (user_id, name, parent_id, is_system) VALUES (?, ?, ?, 1)'
  )

  const insertAll = db.transaction(() => {
    for (const top of categoriesData as CategorySeed[]) {
      const { lastInsertRowid: topId } = insertCategory.run(USER_ID, top.name, null)
      for (const sub of top.subcategories) {
        insertCategory.run(USER_ID, sub, topId)
      }
    }
  })
  insertAll()
}

function seedRules(db: Database.Database): void {
  // Resolves a category by name, disambiguating a sub-category by its parent's name.
  const findCategoryId = db.prepare(`
    SELECT c.id FROM category c
    LEFT JOIN category p ON c.parent_id = p.id
    WHERE c.user_id = ? AND c.name = ? AND (? IS NULL OR p.name = ?)
  `)
  const insertRule = db.prepare(`
    INSERT INTO category_rule (user_id, rule_type, pattern, category_id, priority, is_user_created)
    VALUES (?, ?, ?, ?, ?, 0)
  `)

  function resolveCategoryId(category: string, subcategory: string | undefined, source: string): number {
    const targetName = subcategory ?? category
    const parentName = subcategory ? category : null
    const row = findCategoryId.get(USER_ID, targetName, parentName, parentName) as { id: number } | undefined
    if (!row) {
      throw new Error(`${source} references unknown category "${category}" / "${subcategory ?? ''}"`)
    }
    return row.id
  }

  function insert(ruleType: CategoryRuleType, pattern: string, categoryId: number, priority: number): void {
    insertRule.run(USER_ID, ruleType, pattern, categoryId, priority)
  }

  const insertAll = db.transaction(() => {
    for (const rule of keywordRulesData as KeywordRuleSeed[]) {
      insert('keyword', rule.pattern, resolveCategoryId(rule.category, rule.subcategory, 'keyword_rules.json'), rule.priority)
    }
    // MCC codes are exact-match; a single default priority is fine.
    for (const rule of mccMappingsData as MccRuleSeed[]) {
      insert('mcc', rule.mcc, resolveCategoryId(rule.category, rule.subcategory, 'mcc_mappings.json'), 5)
    }
    for (const rule of vpaMappingsData as VpaRuleSeed[]) {
      insert('vpa', rule.pattern, resolveCategoryId(rule.category, rule.subcategory, 'vpa_mappings.json'), 5)
    }
  })
  insertAll()
}
