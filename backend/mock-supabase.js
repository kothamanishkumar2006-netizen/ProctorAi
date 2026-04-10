const mockData = {
    users: [
        { id: 'u1', email: 'student1@university.edu', password: 'password123', name: 'Jane Doe', role: 'student', student_id: '2024-8839' },
        { id: 'u2', email: 'student2@university.edu', password: 'password123', name: 'Marcus Thorne', role: 'student', student_id: '2024-7721' },
        { id: 'u3', email: 'student3@university.edu', password: 'password123', name: 'Elena Gilbert', role: 'student', student_id: '2024-1102' },
        { id: 'u4', email: 'proctor@example.com', password: 'password123', name: 'Dr. Sarah Smith', role: 'proctor', student_id: null },
        { id: 'u5', email: 'admin@example.com', password: 'password123', name: 'Dr. Harrison', role: 'admin', student_id: null }
    ],
    exams: [
        {
            id: 'e1',
            title: 'Final Exam: Advanced Computer Science',
            course_code: 'CS101-2023-F',
            description: 'Comprehensive final examination',
            duration_minutes: 120,
            start_time: new Date().toISOString(),
            end_time: new Date(Date.now() + 7200000).toISOString()
        }
    ],
    questions: [
        {
            id: 'q1',
            exam_id: 'e1',
            text: 'In the context of asynchronous programming in JavaScript, which of the following best describes the purpose of a "Promise" object?',
            type: 'multiple_choice',
            options: [
                'It serves as a placeholder for a value that may not be available yet.',
                'It guarantees that a function will always execute synchronously without blocking the main thread.',
                'It is a built-in mechanism to prevent any runtime errors from occurring.',
                'It is used primarily to clear the browser\'s cache after a function execution.'
            ],
            correct_index: 0,
            points: 10
        },
        {
            id: 'q2',
            exam_id: 'e1',
            text: 'What is the primary difference between "var", "let", and "const" scope in modern JavaScript?',
            type: 'multiple_choice',
            options: [
                '"var" is block-scoped, while "let" and "const" are function-scoped.',
                '"let" and "const" are block-scoped, while "var" is function-scoped.',
                'All three have the same scoping rules but different reassignment rules.',
                'Scoping depends on whether "strict mode" is enabled.'
            ],
            correct_index: 1,
            points: 10
        },
        {
            id: 'q3',
            exam_id: 'e1',
            text: 'Which architectural pattern is commonly used for building real-time collaboration features in web applications?',
            type: 'multiple_choice',
            options: [
                'MVC (Model-View-Controller)',
                'Pub/Sub (Publisher/Subscriber)',
                'Layered Architecture',
                'Microkernel'
            ],
            correct_index: 1,
            points: 10
        },
        {
            id: 'q4',
            exam_id: 'e1',
            text: 'How does a Content Delivery Network (CDN) improve the performance of a web application?',
            type: 'multiple_choice',
            options: [
                'By compressing the server-side code into binary format.',
                'By caching static assets on geographically distributed servers.',
                'By automatically upgrading the user\'s internet speed.',
                'By encrypting all database transactions using Quantum cryptography.'
            ],
            correct_index: 1,
            points: 10
        },
        {
            id: 'q5',
            exam_id: 'e1',
            text: 'What is the primary purpose of the Virtual DOM in React?',
            type: 'multiple_choice',
            options: [
                'To create a 3D representation of the web page.',
                'To minimize direct manipulation of the actual browser DOM for performance.',
                'To allow the website to run without a browser.',
                'To automatically translate the code into multiple languages.'
            ],
            correct_index: 1,
            points: 10
        }
    ],
    exam_sessions: [
        { id: 's1', exam_id: 'e1', student_id: 'u1', status: 'active', started_at: new Date().toISOString() }
    ],
    answers: [],
    violations: [
        {
            id: 'v1',
            student_id: 'u1',
            exam_id: 'e1',
            type: 'Multiple Faces Detected',
            confidence: 94,
            evidence_url: 'https://picsum.photos/seed/v1/800/450',
            timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
            status: 'pending'
        },
        {
            id: 'v2',
            student_id: 'u2',
            exam_id: 'e1',
            type: 'Unusual Sound Detected',
            confidence: 81,
            evidence_url: 'https://picsum.photos/seed/v2/800/450',
            timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
            status: 'pending'
        },
        {
            id: 'v3',
            student_id: 'u3',
            exam_id: 'e1',
            type: 'Face Not Detected',
            confidence: 100,
            evidence_url: 'https://picsum.photos/seed/v3/800/450',
            timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
            status: 'pending'
        },
        {
            id: 'v4',
            student_id: 'u1',
            exam_id: 'e1',
            type: 'Unauthorized Device Detected',
            confidence: 88,
            evidence_url: 'https://picsum.photos/seed/v4/800/450',
            timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
            status: 'pending'
        },
        {
            id: 'v5',
            student_id: 'u2',
            exam_id: 'e1',
            type: 'Face Out of Frame',
            confidence: 76,
            evidence_url: 'https://picsum.photos/seed/v5/800/450',
            timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
            status: 'pending'
        },
        {
            id: 'v6',
            student_id: 'u3',
            exam_id: 'e1',
            type: 'Tab Switching Detected',
            confidence: 100,
            evidence_url: 'https://picsum.photos/seed/v6/800/450',
            timestamp: new Date(Date.now() - 2 * 60000).toISOString(),
            status: 'pending'
        },
        {
            id: 'v7',
            student_id: 'u1',
            exam_id: 'e1',
            type: 'Eye Gaze Deviation',
            confidence: 65,
            evidence_url: 'https://picsum.photos/seed/v7/800/450',
            timestamp: new Date(Date.now() - 90 * 60000).toISOString(),
            status: 'confirmed'
        },
        {
            id: 'v8',
            student_id: 'u2',
            exam_id: 'e1',
            type: 'Multiple Faces Detected',
            confidence: 97,
            evidence_url: 'https://picsum.photos/seed/v8/800/450',
            timestamp: new Date(Date.now() - 1 * 60000).toISOString(),
            status: 'pending'
        }
    ],
    student_status: [
        { id: 'ss1', student_id: 'u1', status: 'flagged', risk_score: 85, alert_message: 'Multiple Faces Detected', last_activity: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 'ss2', student_id: 'u2', status: 'active',  risk_score: 45, alert_message: 'Eyes off-screen detected', last_activity: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 'ss3', student_id: 'u3', status: 'active',  risk_score: 60, alert_message: 'Face Not Detected',        last_activity: new Date().toISOString(), updated_at: new Date().toISOString() }
    ]
};

// ============================================================
// MockQueryBuilder — one isolated instance per query chain.
// This prevents Promise.all() race conditions where parallel
// queries would overwrite each other's this.currentTable etc.
// ============================================================

class MockQueryBuilder {
    constructor(table) {
        this.currentTable = table;
        this.filters      = [];
        this.isSingle     = false;
        this.queryOptions = {};
        this.operation    = 'select';
        this.dataToInsert = null;
        this.dataToUpdate = null;
        this.limitN       = null;
        this.orderColumn  = null;
        this.orderAscending = true;
    }

    select(columns, options = {}) {
        this.queryOptions = options;
        // If called AFTER a mutation (insert/upsert/update/delete), this is a
        // Supabase "returning" modifier — it means "return the affected rows".
        // Do NOT flip operation back to 'select'; instead record that the caller
        // wants data returned so then() can use tempResultData as finalData.
        if (this.operation === 'select') {
            this.operation = 'select';
        } else {
            // Mutation + .select() → "returning" mode: keep mutation op, mark flag
            this._selectAfterMutation = true;
        }
        return this;
    }

    eq(column, value) {
        this.filters.push({ type: 'eq', column, value });
        return this;
    }

    single() {
        this.isSingle = true;
        return this;
    }

    order(column, { ascending = true } = {}) {
        this.orderColumn    = column;
        this.orderAscending = ascending;
        return this;
    }

    limit(n) {
        this.limitN = n;
        return this;
    }

    insert(data) {
        this.operation    = 'insert';
        this.dataToInsert = data;
        return this;
    }

    upsert(data) {
        this.operation    = 'upsert';
        this.dataToInsert = data;
        return this;
    }

    update(data) {
        this.operation    = 'update';
        this.dataToUpdate = data;
        return this;
    }

    delete() {
        this.operation = 'delete';
        return this;
    }

    async then(onFulfilled, onRejected) {
        console.log(`[MockSupabase] ${this.operation.toUpperCase()} on ${this.currentTable}`);
        try {
            let result;

            // ── Mutations
            if (this.operation === 'insert' || this.operation === 'upsert') {
                let data = Array.isArray(this.dataToInsert) ? this.dataToInsert : [this.dataToInsert];
                const tableData = mockData[this.currentTable] || (mockData[this.currentTable] = []);

                const newRecords = [];
                data.forEach(item => {
                    const existingIndex = (this.operation === 'upsert')
                        ? tableData.findIndex(e =>
                            e.id === item.id ||
                            (item.student_id && e.student_id === item.student_id &&
                             this.currentTable === 'student_status'))
                        : -1;

                    if (existingIndex !== -1) {
                        tableData[existingIndex] = { ...tableData[existingIndex], ...item, updated_at: new Date().toISOString() };
                        newRecords.push(tableData[existingIndex]);
                    } else {
                        const record = {
                            id: item.id || Math.random().toString(36).substr(2, 9),
                            ...item,
                            created_at: item.created_at || new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        };
                        tableData.push(record);
                        newRecords.push(record);
                    }
                });
                console.log(`[MockSupabase] ${this.operation}ed ${newRecords.length} into ${this.currentTable}. Total: ${tableData.length}`);
                this.tempResultData = newRecords;

            } else if (this.operation === 'update') {
                const tableData = mockData[this.currentTable] || [];
                const updatedRecords = [];
                for (const filter of this.filters) {
                    if (filter.type === 'eq') {
                        tableData.forEach(item => {
                            if (item[filter.column] === filter.value) {
                                Object.assign(item, this.dataToUpdate);
                                updatedRecords.push(item);
                            }
                        });
                    }
                }
                this.tempResultData = updatedRecords;

            } else if (this.operation === 'delete') {
                for (const filter of this.filters) {
                    if (filter.type === 'eq') {
                        mockData[this.currentTable] = (mockData[this.currentTable] || [])
                            .filter(item => item[filter.column] !== filter.value);
                    }
                }
                this.tempResultData = [];
            }

            // ── Retrieval
            let finalData;
            if (this.operation === 'select') {
                let data = JSON.parse(JSON.stringify(mockData[this.currentTable] || []));

                // Join simulation for violations and exam_sessions
                if (this.currentTable === 'violations' || this.currentTable === 'exam_sessions') {
                    data = data.map(item => {
                        const user = mockData.users.find(u => u.id === item.student_id || u.student_id === item.student_id);
                        if (user) item.users = { id: user.id, name: user.name, email: user.email, student_id: user.student_id };

                        const exam = mockData.exams.find(e => e.id === item.exam_id);
                        if (exam) item.exams = { id: exam.id, title: exam.title, course_code: exam.course_code };

                        const status = (mockData.student_status || []).find(s => s.student_id === item.student_id);
                        if (status) item.student_status = [status];

                        return item;
                    });
                }

                // Apply eq filters
                for (const filter of this.filters) {
                    if (filter.type === 'eq') {
                        data = data.filter(item => item[filter.column] === filter.value);
                    }
                }

                // Apply order
                if (this.orderColumn) {
                    data.sort((a, b) => {
                        const vA = a[this.orderColumn];
                        const vB = b[this.orderColumn];
                        if (vA < vB) return this.orderAscending ? -1 : 1;
                        if (vA > vB) return this.orderAscending ? 1 : -1;
                        return 0;
                    });
                }

                // Apply limit
                if (this.limitN) data = data.slice(0, this.limitN);

                finalData = data;
            } else {
                finalData = this.tempResultData;
            }

            if (this.queryOptions.count === 'exact') {
                result = { data: this.queryOptions.head ? null : finalData, count: finalData.length, error: null };
            } else if (this.isSingle) {
                result = { data: finalData[0] || null, error: null };
            } else {
                result = { data: finalData, error: null };
            }

            return Promise.resolve(result).then(onFulfilled, onRejected);
        } catch (error) {
            console.error(`[MockSupabase] Error:`, error);
            return Promise.reject(error).catch(onRejected);
        }
    }
}

// ── Factory: createClient() returns an object whose from() spawns
//    a fresh, isolated MockQueryBuilder per query chain.
class MockSupabaseClient {
    from(table) {
        return new MockQueryBuilder(table);
    }

    // Stub for storage (used in production Supabase URL generation)
    get storage() {
        return {
            from: (bucket) => ({
                getPublicUrl: (path) => ({ data: { publicUrl: `https://picsum.photos/seed/${path}/800/450` } }),
                createSignedUrl: async (path) => ({ data: { signedUrl: `https://picsum.photos/seed/${path}/800/450` }, error: null })
            })
        };
    }
}

module.exports = {
    createClient: () => new MockSupabaseClient()
};



